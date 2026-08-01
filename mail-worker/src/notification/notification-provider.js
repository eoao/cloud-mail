class NotificationProvider {
    name = '';

    async send(notification, emailData, env) {
        throw new Error('send() must be overridden');
    }
}

export default NotificationProvider;