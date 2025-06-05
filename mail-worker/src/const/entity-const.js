export const userConst = {
	status: {
		NORMAL: 0,
		BAN: 1
	}
}

export const roleConst = {
	isDefault: {
		CLOSE: 0,
		OPEN: 1
	},
	sendType: {
		COUNT: 'count',
		DAY: 'day'
	}
}

export const permConst = {
	type: {
		BUTTON: 2,
	}
}

export const emailConst = {
	type: {
		SEND: 1,
		RECEIVE: 0,
	},
	status:  {
		RECEIVE: 0,
		SENT: 1,
		DELIVERED: 2,
		BOUNCED: 3,
		COMPLAINED: 4,
		DELAYED: 5,
		SAVING: 6
	}
}

export const attConst = {
	status: {
		NORMAL: 0,
		UNUSED: 1
	},
	type: {
		ATT: 0,
		EMBED: 1
	}
}

export const settingConst = {
	register: {
		OPEN: 0,
		CLOSE: 1,
	},
	receive: {
		OPEN: 0,
		CLOSE: 1,
	},
	send: {
		OPEN: 0,
		CLOSE: 1
	},
	addEmail: {
		OPEN: 0,
		CLOSE: 1,
	},
	manyEmail: {
		OPEN: 0,
		CLOSE: 1,
	},
	registerVerify: {
		OPEN: 0,
		CLOSE: 1,
	},
	addEmailVerify: {
		OPEN: 0,
		CLOSE: 1,
	}
}


export const isDel = {
	DELETE: 1,
	NORMAL: 0
}
