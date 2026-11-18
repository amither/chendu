# 337 晨读

给自家孩子用的 337 晨读 PWA（语文 + 英语），为 iPad 设计。

- App 本体不含任何晨读内容。内容以 zip 内容包的形式，在 iPad 的「家长设置」里导入，存在本机。
- 进度按完成度推进；每天复习旧篇读 1 遍、新篇读 2 遍，第 7 天串读。
- 朗读页：拼音开关、范读与行高亮（无音频时用系统 TTS）、录音回放、遍数计数。

## 开发

```bash
cd app
npm ci
npm run dev     # 本地开发
npm test        # 单元测试
npm run build
```

`scripts/build_pack.py` 把本地素材目录转换成内容包；素材不随仓库发布。

推送到 `main` 后，GitHub Actions 会构建并发布到 GitHub Pages（仓库 Settings → Pages → Source 选 GitHub Actions）。
