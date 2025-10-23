import app from '../hono/hono';
import result from '../model/result';
import oauthService from '../service/oauth-service';
import userContext from '../security/user-context';
import settingService from '../service/setting-service';
import oauthUtils from '../utils/oauth-utils';
import { t } from '../i18n/i18n';
import { eq, and } from 'drizzle-orm';
import orm from '../entity/orm';
import oauthBinding from '../entity/oauth-binding';

// Get user's OAuth bindings
app.get('/oauth/bindings', async (c) => {
	const userId = userContext.getUserId(c);
	const bindings = await oauthService.getUserBindings(c, userId);
	return c.json(result.ok(bindings));
});

// Bind OAuth account
app.post('/oauth/bind', async (c) => {
	const userId = userContext.getUserId(c);
	const { provider, oauthData } = await c.req.json();

	if (!provider || !oauthData) {
		throw new Error(t('parameterError'));
	}

	await oauthService.bindOauthAccount(c, userId, provider, oauthData);
	return c.json(result.ok());
});

// Unbind OAuth account
app.delete('/oauth/unbind', async (c) => {
	const userId = userContext.getUserId(c);
	const { provider } = await c.req.json();

	if (!provider) {
		throw new Error(t('parameterError'));
	}

	await oauthService.unbindOauthAccount(c, userId, provider);
	return c.json(result.ok());
});

// Initialize OAuth login (public endpoint)
app.post('/auth/oauth/login', async (c) => {
	const { provider } = await c.req.json();
	
	if (!provider) {
		throw new Error(t('parameterError'));
	}

	// Validate provider to prevent injection
	if (!/^[a-zA-Z0-9_-]+$/.test(provider) || provider.length > 50) {
		throw new Error(t('parameterError'));
	}

	// Get OAuth settings
	const settings = await settingService.query(c);
	
	if (settings.oauthEnabled !== 0) {
		throw new Error(t('oauthNotEnabled'));
	}

	// Generate state parameter for security
	const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
	
	// Store state, action, and provider in KV (expire in 10 minutes)
	await c.env.kv.put(`oauth_state_${state}`, 'valid', { expirationTtl: 600 });
	await c.env.kv.put(`oauth_action_${state}`, 'login', { expirationTtl: 600 });
	await c.env.kv.put(`oauth_provider_${state}`, provider, { expirationTtl: 600 });

	// Build authorization URL
	const redirectUri = `${new URL(c.req.url).origin}/api/auth/oauth/callback`;
	const clientId = settings.oauthClientId;
	const scopes = settings.oauthScopes || 'openid profile email';
	let authUrl = settings.oauthAuthUrl;

	if (!clientId || !authUrl) {
		throw new Error(t('oauthNotConfigured'));
	}

	// Replace tenant ID for Microsoft
	if (provider === 'microsoft' && settings.oauthTenantId) {
		authUrl = authUrl.replace('/common/', `/${settings.oauthTenantId}/`);
	}

	const authorizationUrl = `${authUrl}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}&scope=${encodeURIComponent(scopes)}`;

	return c.json(result.ok({ authorizationUrl, state }));
});

// Initialize OAuth authorization for binding (requires authentication)
app.post('/oauth/authorize', async (c) => {
	const { provider } = await c.req.json();
	
	if (!provider) {
		throw new Error(t('parameterError'));
	}

	// Validate provider to prevent injection
	if (!/^[a-zA-Z0-9_-]+$/.test(provider) || provider.length > 50) {
		throw new Error(t('parameterError'));
	}

	// Get OAuth settings
	const settings = await settingService.query(c);
	
	if (settings.oauthEnabled !== 0) {
		throw new Error(t('oauthNotEnabled'));
	}

	// Generate state parameter for security
	const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
	
	// Store state, action, provider, and user ID in KV (expire in 10 minutes)
	await c.env.kv.put(`oauth_state_${state}`, 'valid', { expirationTtl: 600 });
	await c.env.kv.put(`oauth_action_${state}`, 'bind', { expirationTtl: 600 });
	await c.env.kv.put(`oauth_provider_${state}`, provider, { expirationTtl: 600 });
	
	// Store user ID for bind action
	const userId = userContext.getUserId(c);
	await c.env.kv.put(`oauth_userid_${state}`, userId.toString(), { expirationTtl: 600 });

	// Build authorization URL
	const redirectUri = `${new URL(c.req.url).origin}/api/auth/oauth/callback`;
	const clientId = settings.oauthClientId;
	const scopes = settings.oauthScopes || 'openid profile email';
	let authUrl = settings.oauthAuthUrl;

	if (!clientId || !authUrl) {
		throw new Error(t('oauthNotConfigured'));
	}

	// Replace tenant ID for Microsoft
	if (provider === 'microsoft' && settings.oauthTenantId) {
		authUrl = authUrl.replace('/common/', `/${settings.oauthTenantId}/`);
	}

	const authorizationUrl = `${authUrl}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}&scope=${encodeURIComponent(scopes)}`;

	return c.json(result.ok({ authorizationUrl, state }));
});

// OAuth callback (public endpoint)
app.get('/auth/oauth/callback', async (c) => {
	const code = c.req.query('code');
	const state = c.req.query('state');
	const error = c.req.query('error');

	if (error) {
		// Sanitize error output to prevent XSS
		const sanitizedError = String(error).replace(/[<>'"]/g, '');
		const sanitizedDesc = String(c.req.query('error_description') || 'Unknown error').replace(/[<>'"]/g, '');
		return c.html(`<h1>OAuth Error</h1><p>${sanitizedError}: ${sanitizedDesc}</p>`, 400);
	}

	if (!code || !state) {
		return c.html('<h1>Missing parameters</h1>', 400);
	}

	// Get provider from KV
	const provider = await c.env.kv.get(`oauth_provider_${state}`);
	if (!provider) {
		return c.html('<h1>Invalid or expired state parameter</h1>', 400);
	}

	try {
		// Get OAuth settings
		const settings = await settingService.query(c);

		if (settings.oauthEnabled !== 0) {
			return c.html('<h1>OAuth is not enabled</h1>', 403);
		}

		// Verify state parameter
		const storedState = await c.env.kv.get(`oauth_state_${state}`);
		if (!storedState) {
			return c.html('<h1>Invalid or expired state parameter</h1>', 400);
		}

		// Get OAuth configuration
		const clientId = settings.oauthClientId;
		const clientSecret = settings.oauthClientSecret;

		if (!clientId || !clientSecret) {
			return c.html('<h1>OAuth provider not configured</h1>', 500);
		}

		// For custom provider, create config from settings
		let customConfig = null;
		if (provider === 'custom' || !['github', 'google', 'microsoft'].includes(provider)) {
			if (!settings.oauthTokenUrl || !settings.oauthUserInfoUrl) {
				return c.html('<h1>Custom OAuth provider URLs not configured</h1>', 500);
			}
			customConfig = {
				tokenUrl: settings.oauthTokenUrl,
				userInfoUrl: settings.oauthUserInfoUrl,
				useBasicAuth: true  // Custom providers (like Discourse) typically use Basic Auth
			};
		} else if (provider === 'microsoft' && settings.oauthTenantId) {
			// Replace tenant ID for Microsoft
			customConfig = {
				tokenUrl: settings.oauthTokenUrl.replace('/common/', `/${settings.oauthTenantId}/`),
				userInfoUrl: settings.oauthUserInfoUrl
			};
		}

		// Exchange code for access token
		const redirectUri = `${new URL(c.req.url).origin}/api/auth/oauth/callback`;
		const tokenData = await oauthUtils.exchangeCodeForToken(provider, code, clientId, clientSecret, redirectUri, customConfig);

		// Get user info from OAuth provider
		const userInfo = await oauthUtils.getUserInfo(provider, tokenData.accessToken, customConfig);

		// Get action from KV (bind or login)
		const action = await c.env.kv.get(`oauth_action_${state}`);

		if (action === 'bind') {
			// Binding flow - get user ID from KV
			const userId = await c.env.kv.get(`oauth_userid_${state}`);
			if (!userId) {
				return c.html('<h1>User session expired</h1>', 401);
			}

			try {
				await oauthService.bindOauthAccount(c, parseInt(userId), provider, {
					oauthId: userInfo.oauthId,
					oauthEmail: userInfo.oauthEmail,
					oauthName: userInfo.oauthName,
					accessToken: tokenData.accessToken,
					refreshToken: tokenData.refreshToken,
					expiresAt: tokenData.expiresAt
				});

				// Clean up KV
				await c.env.kv.delete(`oauth_state_${state}`);
				await c.env.kv.delete(`oauth_action_${state}`);
				await c.env.kv.delete(`oauth_provider_${state}`);
				await c.env.kv.delete(`oauth_userid_${state}`);

				// Redirect back to settings page with success message
				const origin = new URL(c.req.url).origin;
				return c.html(`
					<html>
						<head>
							<title>OAuth Binding Success</title>
							<script>
								window.opener.postMessage({
									type: 'oauth_bind_success',
									provider: '${provider.replace(/[<>'"]/g, '')}'
								}, '${origin}');
								window.close();
							</script>
						</head>
						<body>
							<h3>OAuth account bound successfully</h3>
							<p>You can close this window now.</p>
						</body>
					</html>
				`);
			} catch (bindError) {
				// Clean up KV
				await c.env.kv.delete(`oauth_state_${state}`);
				await c.env.kv.delete(`oauth_action_${state}`);
				await c.env.kv.delete(`oauth_provider_${state}`);
				await c.env.kv.delete(`oauth_userid_${state}`);

				// Send error message to opener window
				const errorMessage = (bindError.message || 'OAuth binding failed').replace(/[<>'"]/g, '');
				const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
				const origin = new URL(c.req.url).origin;
				return c.html(`
					<html>
						<head>
							<title>OAuth Binding Failed</title>
							<script>
								window.opener.postMessage({
									type: 'oauth_error',
									error: '${errorMessage}',
									provider: '${providerName.replace(/[<>'"]/g, '')}'
								}, '${origin}');
								window.close();
							</script>
						</head>
						<body>
							<h3>Binding failed</h3>
							<p>Closing window...</p>
						</body>
					</html>
				`);
			}
		} else {
			// Login flow
			try {
				const token = await oauthService.oauthLogin(c, provider, {
					oauthId: userInfo.oauthId,
					oauthEmail: userInfo.oauthEmail,
					oauthName: userInfo.oauthName,
					accessToken: tokenData.accessToken,
					refreshToken: tokenData.refreshToken,
					expiresAt: tokenData.expiresAt
				});

				// Clean up KV
				await c.env.kv.delete(`oauth_state_${state}`);
				await c.env.kv.delete(`oauth_action_${state}`);
				await c.env.kv.delete(`oauth_provider_${state}`);

				// Redirect to login page with token
				return c.html(`
					<html>
						<head>
							<title>OAuth Login Success</title>
							<script>
								localStorage.setItem('token', '${token}');
								window.location.href = '/';
							</script>
						</head>
						<body>
							<h3>Login successful</h3>
							<p>Redirecting...</p>
						</body>
					</html>
				`);
			} catch (loginError) {
				// Clean up KV
				await c.env.kv.delete(`oauth_state_${state}`);
				await c.env.kv.delete(`oauth_action_${state}`);
				await c.env.kv.delete(`oauth_provider_${state}`);
				
				// Redirect to login page with error message
				const errorMessage = (loginError.message || 'OAuth login failed').replace(/[<>'"]/g, '');
				return c.html(`
					<html>
						<head>
							<title>OAuth Login Failed</title>
							<script>
								sessionStorage.setItem('oauth_error', '${errorMessage}');
								window.location.href = '/login';
							</script>
						</head>
						<body>
							<h3>Redirecting...</h3>
						</body>
					</html>
				`);
			}
		}
	} catch (e) {
		console.error('OAuth callback error:', e);
		// Clean up KV
		const state = c.req.query('state');
		if (state) {
			await c.env.kv.delete(`oauth_state_${state}`);
			await c.env.kv.delete(`oauth_action_${state}`);
			await c.env.kv.delete(`oauth_provider_${state}`);
			await c.env.kv.delete(`oauth_userid_${state}`);
		}
		// Sanitize error message to prevent XSS
		const sanitizedError = (e.message || 'Unknown error').replace(/[<>'"]/g, '');
		const origin = new URL(c.req.url).origin;
		return c.html(`
			<html>
				<head>
					<title>OAuth Error</title>
				</head>
				<body>
					<h1>OAuth callback failed</h1>
					<p>${sanitizedError}</p>
					<script>
						if (window.opener) {
							window.opener.postMessage({
								type: 'oauth_error',
								error: '${sanitizedError}'
							}, '${origin}');
						}
					</script>
				</body>
			</html>
		`, 500);
	}
});

// Refresh OAuth token
app.post('/oauth/refresh', async (c) => {
	const userId = userContext.getUserId(c);
	const { provider } = await c.req.json();

	if (!provider) {
		throw new Error(t('parameterError'));
	}

	// Validate provider to prevent injection
	if (!/^[a-zA-Z0-9_-]+$/.test(provider) || provider.length > 50) {
		throw new Error(t('parameterError'));
	}

	// Get OAuth settings
	const settings = await settingService.query(c);
	const clientId = settings.oauthClientId;
	const clientSecret = settings.oauthClientSecret;

	if (!clientId || !clientSecret) {
		throw new Error(t('oauthNotConfigured'));
	}

	// For custom provider, create config from settings
	let customConfig = null;
	if (provider === 'custom' || !['github', 'google', 'microsoft'].includes(provider)) {
		if (!settings.oauthTokenUrl) {
			throw new Error(t('oauthNotConfigured'));
		}
		customConfig = {
			tokenUrl: settings.oauthTokenUrl,
			useBasicAuth: true
		};
	}

	// Get current binding
	const db = orm(c);
	const bindings = await db.select().from(oauthBinding).where(
		and(
			eq(oauthBinding.userId, userId),
			eq(oauthBinding.provider, provider)
		)
	);

	if (bindings.length === 0) {
		throw new Error(t('oauthNotBound'));
	}

	const binding = bindings[0];

	if (!binding.refreshToken) {
		throw new Error(t('oauthNoRefreshToken'));
	}

	// Refresh the token
	const tokenData = await oauthUtils.refreshAccessToken(
		provider,
		binding.refreshToken,
		clientId,
		clientSecret,
		customConfig
	);

	// Update the binding with new tokens
	await db.update(oauthBinding)
		.set({
			accessToken: tokenData.accessToken,
			refreshToken: tokenData.refreshToken,
			expiresAt: tokenData.expiresAt
		})
		.where(eq(oauthBinding.bindingId, binding.bindingId));

	return c.json(result.ok({ 
		accessToken: tokenData.accessToken,
		expiresAt: tokenData.expiresAt
	}));
});

export default app;

