const KvConst = {
	AUTH_INFO: 'auth-uid:',
	SETTING: 'setting:',
	SEND_DAY_COUNT: 'send_day_count:',
	ANALYSIS_ECHARTS: 'analysis_echarts:',
	PUBLIC_KEY: "public_key:",
	// Schema version the database has been migrated to. Lets a deploy notice it
	// is ahead of its own database and catch up on its own.
	SCHEMA_VERSION: 'schema_version:'
}

export default KvConst;
