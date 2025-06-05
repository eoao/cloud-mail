import settingService from './setting-service';

const initService = {
	async init(c) {

		const secret = c.req.param('secret');

		if (secret !== c.env.jwt_secret) {
			return c.text('secret不匹配');
		}

		await this.intDB(c);
		await this.v1DB(c);
		await settingService.refresh(c);
		return c.text('初始化成功');
	},

	async v1DB(c) {
		// 添加字段
		const ADD_COLUMN_SQL_LIST = [
			`ALTER TABLE email ADD COLUMN type INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE email ADD COLUMN status INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE email ADD COLUMN resend_email_id TEXT;`,
			`ALTER TABLE email ADD COLUMN message TEXT;`,

			`ALTER TABLE setting ADD COLUMN resend_tokens TEXT NOT NULL DEFAULT '{}';`,
			`ALTER TABLE setting ADD COLUMN send INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE setting ADD COLUMN r2_domain TEXT;`,
			`ALTER TABLE setting ADD COLUMN site_key TEXT;`,
			`ALTER TABLE setting ADD COLUMN secret_key TEXT;`,
			`ALTER TABLE setting ADD COLUMN background TEXT;`,
			`ALTER TABLE setting ADD COLUMN login_opacity INTEGER NOT NULL DEFAULT 0.88;`,

			`ALTER TABLE user ADD COLUMN create_ip TEXT;`,
			`ALTER TABLE user ADD COLUMN active_ip TEXT;`,
			`ALTER TABLE user ADD COLUMN os TEXT;`,
			`ALTER TABLE user ADD COLUMN browser TEXT;`,
			`ALTER TABLE user ADD COLUMN device TEXT;`,
			`ALTER TABLE user ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE user ADD COLUMN send_count INTEGER NOT NULL DEFAULT 0;`,

			`ALTER TABLE attachments ADD COLUMN status INTEGER NOT NULL DEFAULT 0;`,
			`ALTER TABLE attachments ADD COLUMN type INTEGER NOT NULL DEFAULT 0;`
		];

		for (let sql of ADD_COLUMN_SQL_LIST) {
			try {
				await c.env.db.prepare(sql).run();
			} catch (e) {
				console.warn(`跳过字段添加，原因：${e.message}`);
			}
		}

		// 创建 perm 表并初始化
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS perm (
        perm_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        perm_key TEXT,
        pid INTEGER NOT NULL DEFAULT 0,
        type INTEGER NOT NULL DEFAULT 2,
        sort INTEGER
      )
    `).run();

		const {permTotal} = await c.env.db.prepare(`SELECT COUNT(*) as permTotal FROM perm`).first();

		if (permTotal === 0) {
			await c.env.db.prepare(`
        INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
        (1, '邮件', NULL, 0, 0, 0),
        (2, '邮件删除', 'email:delete', 1, 2, 1),
        (3, '邮件发送', 'email:send', 1, 2, 0),
        (4, '个人设置', '', 0, 1, 2),
        (5, '用户注销', 'my:delete', 4, 2, 0),
        (6, '用户信息', NULL, 0, 1, 3),
        (7, '用户查看', 'user:query', 6, 2, 0),
        (8, '密码修改', 'user:set-pwd', 6, 2, 2),
        (9, '状态修改', 'user:set-status', 6, 2, 3),
        (10, '权限修改', 'user:set-type', 6, 2, 4),
        (11, '用户删除', 'user:delete', 6, 2, 7),
        (12, '用户收藏', 'user:star', 6, 2, 5),
        (13, '权限控制', '', 0, 1, 5),
        (14, '身份查看', 'role:query', 13, 2, 0),
        (15, '身份修改', 'role:set', 13, 2, 1),
        (16, '身份删除', 'role:delete', 13, 2, 2),
        (17, '系统设置', '', 0, 1, 6),
        (18, '设置查看', 'setting:query', 17, 2, 0),
        (19, '设置修改', 'setting:set', 17, 2, 1),
        (20, '物理清空', 'seting:clear', 17, 2, 2),
        (21, '邮箱侧栏', '', 0, 0, 1),
        (22, '邮箱查看', 'account:query', 21, 2, 0),
        (23, '邮箱添加', 'account:add', 21, 2, 1),
        (24, '邮箱删除', 'account:delete', 21, 2, 2),
        (25, '用户添加', 'user:add', 6, 2, 1),
        (26, '发件重置', 'user:reset-send', 6, 2, 6),
        (27, '邮件列表', '', 0, 1, 4),
        (28, '邮件查看', 'sys-email:query', 27, 2, 0),
        (29, '邮件删除', 'sys-email:delete', 27, 2, 0)
      `).run();
		}

		// 创建 role 表并插入默认身份
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS role (
        role_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        key TEXT,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        sort INTEGER DEFAULT 0,
        description TEXT,
        user_id INTEGER,
        is_default INTEGER DEFAULT 0,
        send_count INTEGER,
        send_type TEXT NOT NULL DEFAULT 'count',
        account_count INTEGER
      )
    `).run();

		const { roleCount } = await c.env.db.prepare(`SELECT COUNT(*) as roleCount FROM role`).first();
		if (roleCount === 0) {
			await c.env.db.prepare(`
        INSERT INTO role (
          role_id, name, key, create_time, sort, description, user_id, is_default, send_count, send_type, account_count
        ) VALUES (
          1, '普通用户', NULL, '0000-00-00 00:00:00', 0, '只有普通使用权限', 0, 1, NULL, 'count', 10
        )
      `).run();
		}

		// 创建 role_perm 表并初始化数据
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS role_perm (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id INTEGER,
        perm_id INTEGER
      )
    `).run();

		const {rolePermCount} = await c.env.db.prepare(`SELECT COUNT(*) as rolePermCount FROM role_perm`).first();
		if (rolePermCount === 0) {
			await c.env.db.prepare(`
        INSERT INTO role_perm (id, role_id, perm_id) VALUES
          (100, 1, 2),
          (101, 1, 21),
          (102, 1, 22),
          (103, 1, 23),
          (104, 1, 24),
          (105, 1, 4),
          (106, 1, 5),
          (107, 1, 1)
      `).run();
		}
	},

	async intDB(c) {
		// 初始化数据库表结构
		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS email (
        email_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        send_email TEXT,
        name TEXT,
        receive_email TEXT NOT NULL,
        account_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        subject TEXT,
        content TEXT,
        text TEXT,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
        is_del INTEGER DEFAULT 0 NOT NULL
      )
    `).run();

		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS star (
        star_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        email_id INTEGER NOT NULL,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `).run();

		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS attachments (
        att_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        email_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        filename TEXT,
        mime_type TEXT,
        size INTEGER,
        disposition TEXT,
        related TEXT,
        content_id TEXT,
        encoding TEXT,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `).run();

		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS user (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        type INTEGER DEFAULT 1 NOT NULL,
        password TEXT NOT NULL,
        salt TEXT NOT NULL,
        status INTEGER DEFAULT 0 NOT NULL,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        active_time DATETIME,
        is_del INTEGER DEFAULT 0 NOT NULL
      )
    `).run();

		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS account (
        account_id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        status INTEGER DEFAULT 0 NOT NULL,
        latest_email_time DATETIME,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id INTEGER NOT NULL,
        is_del INTEGER DEFAULT 0 NOT NULL
      )
    `).run();

		await c.env.db.prepare(`
      CREATE TABLE IF NOT EXISTS setting (
        register INTEGER NOT NULL,
        receive INTEGER NOT NULL,
        add_email INTEGER NOT NULL,
        many_email INTEGER NOT NULL,
        title TEXT NOT NULL,
        auto_refresh_time INTEGER NOT NULL,
        register_verify INTEGER NOT NULL,
        add_email_verify INTEGER NOT NULL
      )
    `).run();

		await c.env.db.prepare(`
      INSERT INTO setting (
        register, receive, add_email, many_email, title, auto_refresh_time, register_verify, add_email_verify
      )
      SELECT 0, 0, 0, 1, 'Cloud 邮箱', 0, 1, 1
      WHERE NOT EXISTS (SELECT 1 FROM setting)
    `).run();
	}
};

export default initService;
