# Cheentu - Multi-User DSA Development Conventions

## 零、概述

本项目基于 [daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis)，在 `feature/multi-user` 分支进行多用户改造。最终目标是让多人独立使用，每人拥有独立的 API Key、自选股和通知配置。

## 一、分支策略

```
main                ← 稳定的多用户版本（合并目标）
feature/multi-user  ← 当前开发分支（所有改动在此）
```

- **永远在 `feature/multi-user` 上开发**
- 每完成一个模块，提交一次，message 格式：`feat(scope): 描述`
- 模块全部完成并测试通过后，合并到 `main`

## 二、提交规范 (Conventional Commits)

```
feat(auth): 新增用户注册/登录 JWT 认证
feat(db): 新增 User/UserConfig 模型
refactor(api): 分析接口注入用户上下文
fix(auth): 修复 token 过期未刷新问题
chore(db): 运行数据库迁移
```

**scope 列表：**
| scope | 含义 |
|-------|------|
| auth | 认证/授权 |
| db | 数据库模型/迁移 |
| api | 后端接口 |
| ui | 前端页面 |
| config | 配置相关 |
| deploy | 部署/打包 |

## 三、代码规范

### Python 后端

- **Python 版本**：>= 3.11
- **格式化**：不做强制，保持与现有代码风格一致
- **类型注解**：新增代码必须带类型注解
- **导入顺序**：标准库 → 第三方 → 项目内部
- **模型文件**：`src/models/` 目录，每个模型一个文件
- **API 端点**：`api/v1/endpoints/` 目录，一个模块一个文件
- **命名**：snake_case 变量/函数，PascalCase 类

### TypeScript 前端

- **React 19 + TypeScript 5.9**
- **组件**：`apps/dsa-web/src/components/` 目录
- **页面**：`apps/dsa-web/src/pages/` 目录
- **API 调用**：统一通过 `apps/dsa-web/src/api/` 模块
- **命名**：PascalCase 组件，camelCase 函数/变量

### 通用

- **不要引入新的依赖**，除非必要
- **不要修改与多用户无关的代码**
- **保留所有原有测试**，新增功能加测试
- **API 路径**：全部在 `/api/v1/` 下，已有路径不变

## 四、数据库迁移

- 使用 Alembic（新加依赖）
- 迁移文件放在 `migrations/versions/`
- 每次模型改动生成一个新迁移
- 迁移必须可逆（`upgrade()` 和 `downgrade()`）

## 五、目录结构（新增部分）

```
src/models/
├── __init__.py          # 模型导出
├── user.py              # User 模型
└── user_config.py       # UserConfig 模型

api/
├── middleware.py         # 认证中间件
└── v1/endpoints/
    └── users.py         # 用户管理 API

apps/dsa-web/src/
├── api/
│   └── auth.ts          # 登录/注册 API
├── pages/
│   ├── LoginPage.tsx    # 扩展登录页
│   ├── RegisterPage.tsx # 注册页（新增）
│   └── SettingsPage.tsx # 扩展设置页
└── stores/
    └── authStore.ts     # 认证状态管理
```

## 六、测试规范

- 后端测试：`tests/` 目录，pytest
- 测试命名：`test_{模块名}_{功能}.py`
- 新功能必须有测试覆盖
- 运行：`python -m pytest tests/ -x`

## 七、部署

- 本地开发测试通过后，打包上传到远程服务器
- 打包命令（后续提供）
- 远程路径：`/opt/cheentu/`
