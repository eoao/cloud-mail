import sqlite3

con = sqlite3.connect(':memory:')
cur = con.cursor()
cur.executescript('''
CREATE TABLE device_token(token_id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,device_token TEXT,platform TEXT,create_time TEXT);
INSERT INTO device_token(user_id,device_token,platform,create_time) VALUES(1,'aa','ios','1'),(2,'bb','ios','2');
''')

v35 = [
'''CREATE TABLE IF NOT EXISTS push_subscription (
    push_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subscription_id TEXT NOT NULL,
    push_secret TEXT NOT NULL,
    account_ref TEXT NOT NULL DEFAULT '',
    create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)''',
"DELETE FROM push_subscription WHERE push_id NOT IN (SELECT MAX(push_id) FROM push_subscription GROUP BY user_id, subscription_id)",
"CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscription_user_id_unique ON push_subscription(user_id, subscription_id)",
"CREATE INDEX IF NOT EXISTS idx_push_subscription_user_created ON push_subscription(user_id, create_time DESC)",
"DELETE FROM device_token",
]
for statement in v35:
    cur.execute(statement)

v36 = [
    "ALTER TABLE push_subscription ADD COLUMN preview_mode TEXT NOT NULL DEFAULT 'privateOnly'",
    "ALTER TABLE push_subscription ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE push_subscription ADD COLUMN badge_enabled INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE push_subscription ADD COLUMN quiet_hours_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE push_subscription ADD COLUMN quiet_start_minutes INTEGER NOT NULL DEFAULT 1320",
    "ALTER TABLE push_subscription ADD COLUMN quiet_end_minutes INTEGER NOT NULL DEFAULT 420",
    "ALTER TABLE push_subscription ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'UTC'",
]
for statement in v36:
    cur.execute(statement)

cur.execute("INSERT INTO push_subscription(user_id,subscription_id,push_secret,account_ref) VALUES(1,'ps_aaaaaaaaaaaaaaaaaaaa','pgs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','11111111-1111-4111-8111-111111111111')")
cur.execute("INSERT INTO push_subscription(user_id,subscription_id,push_secret,account_ref,preview_mode,sound_enabled,badge_enabled,quiet_hours_enabled,time_zone) VALUES(2,'ps_bbbbbbbbbbbbbbbbbbbb','pgs_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','senderAndSubject',0,0,1,'America/Los_Angeles')")
con.commit()

assert cur.execute('SELECT COUNT(*) FROM device_token').fetchone() == (0,)
assert cur.execute('SELECT COUNT(*) FROM push_subscription').fetchone() == (2,)
assert cur.execute("SELECT preview_mode,sound_enabled,badge_enabled FROM push_subscription WHERE user_id=1").fetchone() == ('privateOnly', 1, 1)
assert cur.execute("SELECT preview_mode,sound_enabled,badge_enabled,quiet_hours_enabled,time_zone FROM push_subscription WHERE user_id=2").fetchone() == ('senderAndSubject', 0, 0, 1, 'America/Los_Angeles')
try:
    cur.execute("INSERT INTO push_subscription(user_id,subscription_id,push_secret) VALUES(1,'ps_aaaaaaaaaaaaaaaaaaaa','pgs_cccccccccccccccccccccccccccccccc')")
    raise AssertionError('duplicate (user, subscription_id) should fail')
except sqlite3.IntegrityError:
    pass

print('push gateway + notification preference migration: PASS')
