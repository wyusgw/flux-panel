import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// 面板版本号取构建当天的日期（北京时间），格式 YYYYMMDD
const panelVersion = new Date()
  .toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  .replace(/-/g, '');

export default defineConfig({
  define: {
    __PANEL_VERSION__: JSON.stringify(panelVersion),
  },
  plugins: [
    react(),
    // 用 Tailwind 官方的 Vite 插件而不是 PostCSS 插件：@tailwindcss/postcss 会触发
    // "A PostCSS plugin did not pass the `from` option" 警告
    tailwindcss(),
  ],
  base: '/',    
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: false,  
    rollupOptions: {
      treeshake: false,
    }
  }
});
