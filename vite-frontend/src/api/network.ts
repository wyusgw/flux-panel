import axios, { AxiosResponse } from 'axios';
import { getPanelAddresses, isWebViewFunc} from '@/utils/panel';


interface PanelAddress {
  name: string;
  address: string;   
  inx: boolean;
}

const setPanelAddressesFunc = (newAddress: PanelAddress[]) => {
  newAddress.forEach(item => {
    if (item.inx) {
      baseURL = `${item.address}/api/v1/`;
      axios.defaults.baseURL = baseURL;
    }
  });
}

function getWebViewPanelAddress() {
  (window as any).setAddresses = setPanelAddressesFunc
  getPanelAddresses("setAddresses");
};

let baseURL: string = '';

// 当前访问的面板地址（主机:端口）：后端在站点设置里没有填写「面板后端地址」时，用它自动生成节点安装命令。
// baseURL 是相对路径时就是浏览器地址栏里的地址；App 里是设置的面板地址（绝对路径），取其中的主机和端口
export const getPanelHost = (): string => {
  try {
    return new URL(baseURL || '/', window.location.href).host;
  } catch {
    return window.location.host;
  }
};

export const reinitializeBaseURL = () => {
  if (isWebViewFunc()) {
    getWebViewPanelAddress();
  } else {
    baseURL = import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/v1/` : '/api/v1/';
    axios.defaults.baseURL = baseURL;
  }
};

reinitializeBaseURL();


interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

// 处理token失效的逻辑
function handleTokenExpired() {
  // 清除localStorage中的token
  window.localStorage.removeItem('token');
  window.localStorage.removeItem('role_id');
  window.localStorage.removeItem('name');
  
  // 跳转到登录页面
  if (window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

// 检查响应是否为token失效
function isTokenExpired(response: ApiResponse) {
  // 没带 Token 时后端返回 403 + "Not logged in"
  if (response && response.code === 403 && response.msg === 'Not logged in') {
    return true;
  }
  return response && response.code === 401 && 
         (response.msg === '未登录或token已过期' || 
          response.msg === '无效的token或token已过期' ||
          response.msg === '无法获取用户权限信息');
}


// 后端出错时 HTTP 状态码不再是 200（400、401、403、500 等），但响应体仍是 { code, msg, data }，
// axios 会把它当异常抛出，这里取回响应体，页面照旧读 code / msg。没有响应体（断网、超时、网关错误页）才用通用提示
function responseFromError<T>(error: any, label: string): ApiResponse<T> | null {
  console.error(`${label}请求错误:`, error);
  const body = error?.response?.data;
  if (body && typeof body === 'object' && typeof body.code === 'number') {
    if (isTokenExpired(body)) {
      handleTokenExpired();
      return null;
    }
    return body as ApiResponse<T>;
  }
  // 旧版后端的 401 没有响应体也按登录失效处理
  if (error?.response?.status === 401) {
    handleTokenExpired();
    return null;
  }
  return { code: -1, msg: error?.message || '网络请求失败', data: null as T };
}

const Network = {
  get: function<T = any>(path: string = '', data: any = {}): Promise<ApiResponse<T>> {
    return new Promise(function(resolve) {
      // 如果baseURL是默认值且是WebView环境，说明没有设置面板地址
      if (baseURL === '') {
        resolve({"code": -1, "msg": " - 请先设置面板地址", "data": null as T});
        return;
      }

      axios.get(path, {
        params: data,
        timeout: 30000,
        headers: {
          "Authorization": window.localStorage.getItem('token'),
          "X-Panel-Addr": getPanelHost()
        }
      })
        .then(function(response: AxiosResponse<ApiResponse<T>>) {
          // 检查是否token失效
          if (isTokenExpired(response.data)) {
            handleTokenExpired();
            return;
          }
          resolve(response.data);
        })
        .catch(function(error: any) {
          const result = responseFromError<T>(error, 'GET');
          if (result) {
            resolve(result);
          }
        });
    });
  },

  post: function<T = any>(path: string = '', data: any = {}, timeout: number = 30000): Promise<ApiResponse<T>> {
    return new Promise(function(resolve) {
      // 如果baseURL是默认值且是WebView环境，说明没有设置面板地址
      if (baseURL === '') {
        resolve({"code": -1, "msg": " - 请先设置面板地址", "data": null as T});
        return;
      }

      axios.post(path, data, {
        timeout,
        headers: {
          "Authorization": window.localStorage.getItem('token'),
          "Content-Type": "application/json",
          "X-Panel-Addr": getPanelHost()
        }
      })
        .then(function(response: AxiosResponse<ApiResponse<T>>) {
          // 检查是否token失效
          if (isTokenExpired(response.data)) {
            handleTokenExpired();
            return;
          }
          resolve(response.data);
        })
        .catch(function(error: any) {
          const result = responseFromError<T>(error, 'POST');
          if (result) {
            resolve(result);
          }
        });
    });
  }
};

export default Network; 