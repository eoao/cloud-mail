import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, isNull, inArray, notInArray } from 'drizzle-orm';
import r2Service from './r2-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { attConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';

const attService = {

	async addAtt(c, attachments) {

		for (let attachment of attachments) {
			await r2Service.putObj(c, attachment.key, attachment.content, {
				contentType: attachment.mimeType,
				contentDisposition: `attachment; filename="${attachment.filename}"`
			});
		}

		await orm(c).insert(att).values(attachments).run();
	},

	list(c, params, userId) {
		const { emailId } = params;

		return orm(c).select().from(att).where(
			and(
				eq(att.emailId, emailId),
				eq(att.userId, userId),
				eq(att.type, attConst.type.ATT),
				isNull(att.contentId)
			)
		).all();
	},

	async toImageUrlHtml(c, content, r2Domain) {

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const attDataList = [];

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				const buff = await file.arrayBuffer();
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(file.name);
				img.setAttribute('src', r2Domain + '/' + key);

				const attData = {};
				attData.key = key;
				attData.filename = file.name;
				attData.mimeType = file.type;
				attData.size = file.size;
				attData.buff = buff;

				attDataList.push(attData);
			}

			const hasInlineWidth = img.hasAttribute('width');
			const style = img.getAttribute('style') || '';
			const hasStyleWidth = /(^|\s)width\s*:\s*[^;]+/.test(style);

			if (!hasInlineWidth && !hasStyleWidth) {
				const newStyle = (style ? style.trim().replace(/;$/, '') + '; ' : '') + 'max-width: 100%;';
				img.setAttribute('style', newStyle);
			}
		}
		return { attDataList, html: document.toString() };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId) {

		const attDataList = [];

		for (let att of attList) {
			att.buff = fileUtils.base64ToUint8Array(att.content);
			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			const attData = { userId, accountId, emailId };
			attData.key = att.key;
			attData.size = att.buff.length;
			attData.filename = att.filename;
			attData.mimeType = att.type;
			attData.type = attConst.type.ATT;
			attDataList.push(attData);
		}

		await orm(c).insert(att).values(attDataList).run();

		for (let att of attList) {
			await r2Service.putObj(c, att.key, att.buff, {
				contentType: att.type,
				contentDisposition: `attachment; filename="${att.filename}"`
			});
		}

	},

	async saveArticleAtt(c, attDataList, userId, accountId, emailId) {

		for (let attData of attDataList) {
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			await r2Service.putObj(c, attData.key, attData.buff, {
				contentType: attData.mimeType
			});
		}

		await orm(c).insert(att).values(attDataList).run();

	},

	async removeByUserIds(c, userIds) {
		await this.removeAttByField(c, att.userId, userIds);
	},

	async removeByEmailIds(c, emailIds) {
		await this.removeAttByField(c, att.emailId, emailIds);
	},

	async removeByAccountIds(c, accountIds) {
		await this.removeAttByField(c, att.accountId, accountIds);
	},

	async removeAttByField(c, fieldName, fieldValues) {

		const condition = inArray(fieldName, fieldValues);
		const attList = await orm(c).select().from(att).where(condition).limit(99);

		if (attList.length === 0) {
			return;
		}

		const attIds = attList.map(attRow => attRow.attId);
		const keys = attList.map(attRow => attRow.key);
		await orm(c).delete(att).where(inArray(att.attId, attIds)).run();

		const existAttRows = await orm(c).select().from(att).where(inArray(att.key, keys)).all();
		const existKeys = existAttRows.map(attRow => attRow.key);
		const delKeyList = keys.filter(key => !existKeys.includes(key));
		if (delKeyList.length > 0) {
			await c.env.r2.delete(delKeyList);
		}

		if (attList.length >= 99) {
			await this.removeAttByField(c, fieldName, fieldValues);
		}
	},

	selectByEmailIds(c, emailIds) {
		return orm(c).select().from(att).where(and(inArray(att.emailId,emailIds),eq(att.type, attConst.type.ATT))).all();
	}
};

export default attService;
