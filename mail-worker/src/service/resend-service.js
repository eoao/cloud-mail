import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

// Delivery-status webhooks, normalised across providers.
//
// Each provider posts its own event vocabulary; we map it onto the shared
// email.status enum and match the row by the provider's message id (stored in
// the historically named resend_email_id column).

const RESEND_STATUS = {
	'email.sent': { status: emailConst.status.SENT },
	'email.delivered': { status: emailConst.status.DELIVERED },
	'email.complained': { status: emailConst.status.COMPLAINED },
	'email.delivery_delayed': { status: emailConst.status.DELAYED },
	'email.bounced': { status: emailConst.status.BOUNCED, message: b => JSON.stringify(b.data?.bounce) },
	'email.failed': { status: emailConst.status.FAILED, message: b => b.data?.failed?.reason }
};

const POSTMARK_STATUS = {
	Delivery: { status: emailConst.status.DELIVERED },
	Bounce: { status: emailConst.status.BOUNCED, message: b => b.Description || b.Details },
	SpamComplaint: { status: emailConst.status.COMPLAINED }
};

const SENDGRID_STATUS = {
	delivered: emailConst.status.DELIVERED,
	bounce: emailConst.status.BOUNCED,
	dropped: emailConst.status.FAILED,
	deferred: emailConst.status.DELAYED,
	spamreport: emailConst.status.COMPLAINED
};

/** Translate one provider payload into { providerMessageId, status, message } or null. */
export function normalizeWebhook(provider, body) {

	if (provider === 'resend') {
		const mapped = RESEND_STATUS[body.type];
		if (!mapped) return null;
		return {
			providerMessageId: body.data?.email_id,
			status: mapped.status,
			message: mapped.message ? mapped.message(body) : null
		};
	}

	if (provider === 'postmark') {
		const mapped = POSTMARK_STATUS[body.RecordType];
		if (!mapped) return null;
		return {
			providerMessageId: body.MessageID,
			status: mapped.status,
			message: mapped.message ? mapped.message(body) : null
		};
	}

	if (provider === 'sendgrid') {
		// SendGrid posts an array; the caller unwraps it before reaching here.
		const status = SENDGRID_STATUS[body.event];
		if (status === undefined) return null;
		return {
			providerMessageId: body.sg_message_id?.split('.')[0] ?? body.sg_message_id,
			status,
			message: body.reason ?? null
		};
	}

	return null;
}

const resendService = {

	normalizeWebhook,

	async webhooks(c, body, provider = 'resend') {

		// SendGrid batches events into one array POST.
		const events = Array.isArray(body) ? body : [body];
		let applied = 0;

		for (const event of events) {

			const mapped = normalizeWebhook(provider, event);

			if (!mapped?.providerMessageId) {
				continue;
			}

			const row = await emailService.updateEmailStatus(c, {
				resendEmailId: mapped.providerMessageId,
				status: mapped.status,
				message: mapped.message ?? null
			});

			if (row) {
				applied++;
			}
		}

		// A batch where nothing matched means the ids are wrong, which is worth
		// surfacing; a batch of ignored event types is not.
		if (applied === 0 && events.length === 1) {
			throw new BizError('no email matched this webhook');
		}

		return applied;
	}
};

export default resendService;
