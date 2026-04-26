# Meshworks

Meshworks is a gear-driven factory puzzle about routing torque across a hex grid, powering conveyor lines, and growing a compact workshop into a thriving logistics machine.

Chinese support is included in-game via the top-right language toggle. The README defaults to English first, followed by a Chinese section.

## Overview

Meshworks blends mechanical puzzle design with light factory automation. You place small and large gears on a hex grid, transmit torque from a rotor to a generator, power production lines, and expand your workshop through upgrades.

Key features:

- Gear placement on a hex grid with drivetrain deadlock checks
- Power generation, conveyor flow, packaging, and truck delivery
- Upgrade system for torque, efficiency, throughput, trucks, and extra lines
- English-first UI with an in-game Chinese toggle
- Lightweight synthesized sound effects with an in-game sound toggle

## Tech Stack

- Plain HTML, CSS, and JavaScript
- No framework runtime
- Node.js scripts for local development and static builds

## Project Structure

```text
.
|- gear-puzzle.html
|- gear-puzzle.js
|- gear-pipeline.js
|- dev-server.js
|- build-static.js
|- package.json
`- dist/
```

## Running Locally

Requirements:

- Node.js 18+ recommended

Commands:

```bash
npm run dev
```

This starts a local server at `http://127.0.0.1:3000` by default. If that port is busy, the dev server will try the next few ports automatically.

## Building

```bash
npm run build
```

Build output:

- `dist/index.html`
- `dist/gear-puzzle.js`
- `dist/gear-pipeline.js`

## Controls

- Click a hex to place the selected gear
- Use the bottom toolbar to switch between small gear, large gear, and delete
- After the factory view unlocks, drag to pan, use the mouse wheel to zoom, and use `WASD` or arrow keys to move

## Open Source Notes

Recommended files to publish:

- `gear-puzzle.html`
- `gear-puzzle.js`
- `gear-pipeline.js`
- `dev-server.js`
- `build-static.js`
- `package.json`
- `README.md`
- `LICENSE`

You may also publish `dist/` if you want a ready-to-run build in the repository, but it is not required for source-first open source hosting.

## License

This project is released under the MIT License. See `LICENSE` for details.

---

# Meshworks 中文说明

Meshworks 是一款以齿轮传动为核心的工厂解谜游戏。玩家需要在六边形网格上传递扭矩、驱动传送带，并把一个小型工坊逐步扩展成高效运转的物流系统。

游戏内右上角提供中英文切换按钮。为了方便国际开源展示，本 README 默认先显示英文，再提供中文说明。

## 项目简介

Meshworks 将机械传动解谜与轻量工厂自动化结合在一起。你需要在六边形网格上放置大小齿轮，把动力从转子传到发电机，再驱动流水线、打包、装车和运输，并通过升级逐步扩张整套系统。

主要特点：

- 基于六边形网格的齿轮摆放与传动卡死检测
- 发电、传送、打包、装车和送货组成的工厂流程
- 可升级转子、效率、产能、货车和额外产线
- 默认英文界面，并支持在游戏中切换为中文
- 使用原生 Web Audio 合成的轻量音效，并支持一键开关

## 技术栈

- 原生 HTML、CSS、JavaScript
- 无框架运行时依赖
- 使用 Node.js 脚本进行本地开发和静态构建

## 项目结构

```text
.
|- gear-puzzle.html
|- gear-puzzle.js
|- gear-pipeline.js
|- dev-server.js
|- build-static.js
|- package.json
`- dist/
```

## 本地运行

环境要求：

- 推荐 Node.js 18 或更高版本

启动命令：

```bash
npm run dev
```

默认会在 `http://127.0.0.1:3000` 启动本地开发服务器；如果端口被占用，脚本会自动尝试后续端口。

## 构建

```bash
npm run build
```

构建产物：

- `dist/index.html`
- `dist/gear-puzzle.js`
- `dist/gear-pipeline.js`

## 操作方式

- 点击六边形格子放置当前选中的齿轮
- 使用底部工具栏切换小齿轮、大齿轮和删除模式
- 解锁工厂视角后，可拖动画面平移、滚轮缩放，并使用 `WASD` 或方向键移动

## 开源建议

建议公开这些文件：

- `gear-puzzle.html`
- `gear-puzzle.js`
- `gear-pipeline.js`
- `dev-server.js`
- `build-static.js`
- `package.json`
- `README.md`
- `LICENSE`

如果你希望仓库中直接附带可运行版本，也可以一并公开 `dist/`，但对于以源码为主的开源仓库来说不是必须。

## 许可证

本项目采用 MIT License，详见 `LICENSE` 文件。
