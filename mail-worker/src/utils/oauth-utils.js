// OAuth utilities for handling token exchange and user info retrieval

const oauthUtils = {
	// OAuth provider configurations
	providers: {
		github: {
			tokenUrl: 'https://github.com/login/oauth/access_token',
			userInfoUrl: 'https://api.github.com/user',
			userEmailUrl: 'https://api.github.com/user/emails'
		},
		google: {
			tokenUrl: 'https://oauth2.googleapis.com/token',
			userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
		},
		microsoft: {
			tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
			userInfoUrl: 'https://graph.microsoft.com/v1.0/me'
		}
	},

	// Exchange authorization code for access token
	async exchangeCodeForToken(provider, code, clientId, clientSecret, redirectUri, customConfig = null) {
		const config = customConfig || this.providers[provider];
		if (!config) {
			throw new Error(`Unknown OAuth provider: ${provider}`);
		}

		const params = {
			client_id: clientId,
			client_secret: clientSecret,
			code: code,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		};

		const headers = {
			'Accept': 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded'
		};

		// Some providers (like some custom OAuth) require Basic Auth
		// Try body-based auth first (works for GitHub, Google)
		let body = new URLSearchParams(params).toString();
		let useBasicAuth = false;

		// For custom providers, try Basic Auth if specified in config
		if (customConfig && customConfig.useBasicAuth) {
			useBasicAuth = true;
			// Base64 encode for Basic Auth (Cloudflare Workers compatible)
			const credentials = `${clientId}:${clientSecret}`;
			const basicAuth = btoa(credentials);
			headers['Authorization'] = `Basic ${basicAuth}`;
			// Remove client_secret from body when using Basic Auth
			delete params.client_secret;
			body = new URLSearchParams(params).toString();
		}

		try {
			const response = await fetch(config.tokenUrl, {
				method: 'POST',
				headers: headers,
				body: body
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Token exchange failed: ${error}`);
			}

			const data = await response.json();

			if (data.error) {
				throw new Error(`OAuth error: ${data.error_description || data.error}`);
			}

			return {
				accessToken: data.access_token,
				refreshToken: data.refresh_token || null,
				expiresIn: data.expires_in,
				expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null
			};
		} catch (error) {
			console.error(`Token exchange error for ${provider}:`, error);
			throw error;
		}
	},

	// Get user info from OAuth provider
	async getUserInfo(provider, accessToken, customConfig = null) {
		const config = customConfig || this.providers[provider];
		if (!config) {
			throw new Error(`Unknown OAuth provider: ${provider}`);
		}

		const headers = {
			'Authorization': `Bearer ${accessToken}`,
			'Accept': 'application/json',
			'User-Agent': 'CloudMail-OAuth-App'
		};

		try {
			const response = await fetch(config.userInfoUrl, {
				method: 'GET',
				headers: headers
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Failed to get user info: ${response.statusText} - ${errorText}`);
			}

			const data = await response.json();

			// Normalize user info based on provider
			if (provider === 'github') {
				// If email is null (private), fetch from emails endpoint
				let email = data.email;
				if (!email && config.userEmailUrl) {
					const emailResponse = await fetch(config.userEmailUrl, {
						method: 'GET',
						headers: headers
					});
					if (emailResponse.ok) {
						const emails = await emailResponse.json();
						const primaryEmail = emails.find(e => e.primary && e.verified);
						email = primaryEmail ? primaryEmail.email : (emails[0] ? emails[0].email : null);
					}
				}
				
				return {
					oauthId: data.id.toString(),
					oauthEmail: email,
					oauthName: data.login,
					oauthAvatar: data.avatar_url
				};
			} else if (provider === 'google') {
				return {
					oauthId: data.id,
					oauthEmail: data.email,
					oauthName: data.name,
					oauthAvatar: data.picture
				};
			} else if (provider === 'microsoft') {
				return {
					oauthId: data.id,
					oauthEmail: data.mail || data.userPrincipalName,
					oauthName: data.displayName || data.givenName,
					oauthAvatar: null
				};
			} else {
				// Custom provider - try to extract common fields
				// Support multiple OAuth/OIDC standards and Discourse format
				const userId = data.id || data.sub || data.user_id || data.uid;
				const userEmail = data.email || data.mail || data.emailAddress;
				const userName = data.name || data.username || data.login || data.displayName || data.nickname;
				
				// Handle Discourse avatar_template (needs base URL and size)
				let avatar = data.avatar_url || data.picture || data.avatar || null;
				if (!avatar && data.avatar_template) {
					// Discourse avatar template format: /user_avatar/domain/{username}/{size}/123.png
					// Use size 120 as default
					avatar = data.avatar_template.replace('{size}', '120');
				}
				
				return {
					oauthId: userId?.toString(),
					oauthEmail: userEmail,
					oauthName: userName,
					oauthAvatar: avatar
				};
			}
		} catch (error) {
			console.error(`Get user info error for ${provider}:`, error);
			throw error;
		}
	},

	// Refresh access token
	async refreshAccessToken(provider, refreshToken, clientId, clientSecret, customConfig = null) {
		const config = customConfig || this.providers[provider];
		if (!config) {
			throw new Error(`Unknown OAuth provider: ${provider}`);
		}

		if (!refreshToken) {
			throw new Error('Refresh token not available');
		}

		const params = {
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: 'refresh_token'
		};

		const headers = {
			'Accept': 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded'
		};

		let body = new URLSearchParams(params).toString();

		// Use Basic Auth for custom providers
		if (customConfig && customConfig.useBasicAuth) {
			const credentials = `${clientId}:${clientSecret}`;
			const basicAuth = btoa(credentials);
			headers['Authorization'] = `Basic ${basicAuth}`;
			delete params.client_secret;
			body = new URLSearchParams(params).toString();
		}

		try {
			const response = await fetch(config.tokenUrl, {
				method: 'POST',
				headers: headers,
				body: body
			});

			if (!response.ok) {
				throw new Error(`Token refresh failed: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.error) {
				throw new Error(`OAuth error: ${data.error_description || data.error}`);
			}

			return {
				accessToken: data.access_token,
				refreshToken: data.refresh_token || refreshToken,
				expiresIn: data.expires_in,
				expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null
			};
		} catch (error) {
			console.error(`Token refresh error for ${provider}:`, error);
			throw error;
		}
	}
};

export default oauthUtils;

