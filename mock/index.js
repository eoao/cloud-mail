// Mock 数据服务
class MockService {
  constructor() {
    this.setupMockData();
  }

  setupMockData() {
    // 拦截 axios 请求
    if (import.meta.env.VITE_MOCK_MODE === 'true') {
      this.interceptRequests();
    }
  }

  interceptRequests() {
    // 这里可以添加 Mock 数据拦截逻辑
    console.log('Mock 模式已启用');
  }

  // Mock 网站配置
  getWebsiteConfig() {
    return {
      code: 200,
      data: {
        title: 'Cloud Mail Dev',
        domainList: ['localhost', 'example.com'],
        loginDomain: 0,
        register: 0,
        regKey: 1,
        loginOpacity: 0.9,
        background: null,
        siteKey: null,
        registerVerify: 1,
        regVerifyOpen: false
      }
    };
  }

  // Mock 登录
  login(email, password) {
    if (email && password) {
      return {
        code: 200,
        data: {
          token: 'mock-token-' + Date.now()
        }
      };
    }
    return {
      code: 400,
      message: '邮箱或密码错误'
    };
  }

  // Mock 用户信息
  getUserInfo() {
    return {
      code: 200,
      data: {
        accountId: 1,
        email: 'admin@localhost',
        username: 'Mock User',
        permKeys: ['email', 'setting', 'star']
      }
    };
  }
}

export default new MockService();