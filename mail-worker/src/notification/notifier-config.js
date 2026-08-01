import orm from '../entity/orm.js';
import { notifyRule } from '../entity/notify-rule.js';
import { eq } from 'drizzle-orm';

function filterByNotifiers(rules, env) {
	const raw = env.NOTIFIERS?.trim();
	if (!raw || raw === '*') return rules;
	const allowed = raw.split(',').map(s => s.trim().toLowerCase());
	return rules.filter(r => allowed.includes(r.type));
}

export async function loadNotifiers(env) {
	const dbRules = await orm({ env }).select().from(notifyRule)
		.where(eq(notifyRule.enabled, 1)).all();
	return filterByNotifiers(dbRules, env);
}
