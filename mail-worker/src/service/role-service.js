import role from '../entity/role';
import orm from '../entity/orm';
import { eq, asc, inArray, and } from 'drizzle-orm';
import BizError from '../error/biz-error';
import rolePerm from '../entity/role-perm';
import perm from '../entity/perm';
import { permConst, roleConst } from '../const/entity-const';
import userService from './user-service';

const roleService = {

	async add(c, params, userId) {

		let { name, permIds } = params;

		if (!name) {
			throw new BizError('身份名不能为空');
		}

		let roleRow = await orm(c).select().from(role).where(eq(role.name, name)).get();

		if (roleRow) {
			throw new BizError('身份名已存在');
		}

		roleRow = await orm(c).insert(role).values({...params, userId}).returning().get();

		if (permIds.length === 0) {
			return;
		}

		const rolePermList = permIds.map(permId => ({ permId, roleId: roleRow.roleId }));

		await orm(c).insert(rolePerm).values(rolePermList).run();


	},

	async roleList(c) {

		const roleList = await orm(c).select().from(role).orderBy(asc(role.sort)).all();
		const permList = await orm(c).select({ permId: perm.permId, roleId: rolePerm.roleId }).from(rolePerm)
			.leftJoin(perm, eq(perm.permId, rolePerm.permId))
			.where(eq(perm.type, permConst.type.BUTTON)).all();

		roleList.forEach(role => {
			role.permIds = permList.filter(perm => perm.roleId === role.roleId).map(perm => perm.permId);
		});

		return roleList;
	},

	async setRole(c, params) {

		let { name, permIds, roleId } = params;

		if (!name) {
			throw new BizError('名字不能为空');
		}

		delete params.isDefault

		await orm(c).update(role).set({...params}).where(eq(role.roleId, roleId)).run();
		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, roleId)).run();

		if (permIds.length > 0) {
			const rolePermList = permIds.map(permId => ({ permId, roleId: roleId }));
			await orm(c).insert(rolePerm).values(rolePermList).run();
		}

	},

	async delete(c, params) {

		const { roleId } = params;

		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, roleId)).get();

		if (!roleRow) {
			throw new BizError('身份不存在');
		}

		if (roleRow.isDefault) {
			throw new BizError('默认身份不能删除');
		}

		const defRoleRow = await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();

		await userService.updateAllUserType(c, defRoleRow.roleId, roleId);

		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, roleId)).run();
		await orm(c).delete(role).where(eq(role.roleId, roleId)).run();

	},

	roleSelectUse(c) {
		return orm(c).select({ name: role.name, roleId: role.roleId }).from(role).orderBy(asc(role.sort)).all();
	},

	async selectDefaultRole(c) {
		return await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();
	},

	async setDefault(c, params) {
		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, params.roleId)).get();
		if (!roleRow) {
			throw new BizError('身份不存在');
		}
		await orm(c).update(role).set({ isDefault: 0 }).run();
		await orm(c).update(role).set({ isDefault: 1 }).where(eq(role.roleId, params.roleId)).run();
	},

	selectById(c, roleId) {
		return orm(c).select().from(role).where(eq(role.roleId, roleId)).get();
	},

	selectByIdsHasPermKey(c, types, permKey) {
		return orm(c).select({ roleId: role.roleId, sendType: role.sendType, sendCount: role.sendCount }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), inArray(role.roleId, types))).all();
	},

	selectByIdsAndSendType(c, permKey, sendType) {
		return orm(c).select({ roleId: role.roleId }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), eq(role.sendType, sendType))).all();
	}
};

export default roleService;
