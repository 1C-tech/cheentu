# Cheentu Development Standards

> 基于 daily_stock_analysis 的多用户改造项目。本文件覆盖代码风格、质量门禁、测试规范和工作流。

---

## 一、分支与提交 (Branch & Commit)

### 分支策略

```
main                ← 稳定版本
feature/multi-user  ← 当前开发分支
```

- 永远在 `feature/multi-user` 开发，不直接在 `main` 改动
- 每完成一个原子模块提交一次

### 提交格式 (Conventional Commits)

```
<type>(<scope>): <简短描述>
```

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `refactor` | 重构（不改变行为） |
| `chore` | 工程性改动（依赖、构建、迁移） |
| `test` | 测试相关 |
| `docs` | 文档 |

| scope | 含义 |
|-------|------|
| `auth` | 认证/授权（JWT、登录、注册） |
| `db` | 数据库模型/迁移/ORM |
| `api` | 后端接口 |
| `ui` | 前端页面/组件 |
| `config` | 配置体系 |
| `deploy` | 部署/打包 |

**示例：**
```
feat(db): 新增 User 模型和迁移
feat(auth): 实现 JWT 登录/注册 API
feat(api): 分析接口注入用户上下文
feat(ui): 新增注册页面
refactor(auth): 提取 get_current_user 依赖到中间件
fix(auth): 修复 token 过期 401 未跳转登录页
chore(db): 运行初始迁移，创建 admin 用户
```

---

## 二、Python 后端代码风格

### 文件头

```python
# -*- coding: utf-8 -*-
"""模块用途一句话描述。"""
```

### 导入顺序

```python
# 1. 标准库
from __future__ import annotations
import logging
from typing import Optional, List

# 2. 第三方库
from fastapi import APIRouter, Depends
from sqlalchemy import Column, String, Integer
from pydantic import BaseModel

# 3. 项目内部
from src.config import get_config
from api.deps import get_db
from .schemas import UserResponse
```

### 命名规范

- 类名：`PascalCase` → `UserService`, `AuthMiddleware`
- 函数/变量：`snake_case` → `get_current_user`, `stock_list`
- 常量：`UPPER_SNAKE_CASE` → `MIN_PASSWORD_LEN = 6`
- 私有函数：`_` 前缀 → `_verify_password`
- 布尔变量：`is_` / `has_` 前缀 → `is_active`, `has_stored_password`

### 类型注解（强制）

已有代码风格参考 `src/enums.py`、`src/analyzer.py`：
```python
from typing import Optional, Dict, List, Any, Tuple

class ReportType(str, Enum):
    @classmethod
    def from_str(cls, value: str) -> "ReportType":
        ...

def render_overview(
    pack: Any,
    *,
    report_language: str = "zh",
) -> Optional[Dict[str, Any]]:
    ...
```

新代码**必须**带类型注解。不写 `Any` 当你知道具体类型时。

### docstring

已有代码风格：中文模块级 docstring + 关键函数简要说明。
```python
"""Web admin authentication module.

Single toggle (ADMIN_AUTH_ENABLED) + file-based credentials.
"""
```

新模块用英文 docstring，关键函数加中文注释说明业务逻辑。

### 格式化

不做强制格式化工具，但遵循：
- 缩进 4 空格
- 行宽 ≤ 120 字符
- 函数间空两行，类方法间空一行
- 尾部逗号（trailing comma）在长参数列表中使用

---

## 三、TypeScript 前端代码风格

### 文件结构（遵循现有风格）

```
src/
├── api/            # API 请求函数，统一从这导出
├── components/     # 可复用组件，按功能分文件夹
├── contexts/       # React Context（如 AuthContext）
├── hooks/          # 自定义 Hook
├── i18n/           # 国际化文本
├── locales/        # 功能文本标签
├── pages/          # 页面级组件
├── stores/         # Zustand store
├── types/          # TypeScript 类型定义
├── utils/          # 工具函数
├── App.tsx         # 根组件 + 路由
└── main.tsx        # 入口
```

### 导入顺序

```typescript
// 1. React 核心
import type React from 'react';
import { useState, useEffect } from 'react';

// 2. 第三方库
import { BrowserRouter } from 'react-router-dom';
import { Button, Card } from '../components/common';

// 3. 项目内部（绝对路径优先，再相对路径）
import { useAuth } from './contexts/AuthContext';
import { login } from '../../api/auth';
```

### 命名规范

- 组件文件：`PascalCase` → `LoginPage.tsx`, `AlertRuleForm.tsx`
- 工具/API 模块：`camelCase` → `authStore.ts`, `featureText.ts`
- 组件名：`PascalCase` → `const LoginPage: React.FC = () =>`
- 函数/变量：`camelCase` → `handleSubmit`, `isLoading`
- 类型/接口：`PascalCase` → `LoginRequest`, `AlertRuleItem`
- 常量：`UPPER_SNAKE_CASE` → `COOKIE_NAME`, `UI_LANGUAGE_STORAGE_KEY`

### Props 类型

```typescript
// 用 interface，与现有风格一致
export interface AlertRuleBusyState {
  id: number;
  action: AlertRuleBusyAction;
}

// 组件 props 用 type 或 inline
const MyComponent: React.FC<{ title: string }> = ({ title }) => ...
```

### 状态管理

使用 Zustand（已有项目约定），新 store 放 `src/stores/`。
```typescript
// stores/authStore.ts
interface AuthState {
  token: string | null;
  user: UserInfo | null;
  login: (username: string, password: string) => Promise<void>;
}
```

---

## 四、代码质量门禁 (Quality Gates)

### 必须满足

- [ ] **无 TypeScript 编译错误**：`tsc -b --noEmit` 通过
- [ ] **前端 build 通过**：`npm run build` 无报错
- [ ] **后端导入无错误**：`python -c "import src; import api"` 不报错
- [ ] **数据库迁移可双向运行**：`upgrade()` 和 `downgrade()` 都通过
- [ ] **无 import 循环依赖**：新模块不引入循环导入
- [ ] **敏感信息不入库**：`.env` 中的密钥、密码不提交

### 建议满足

- [ ] 不改动与多用户无关的现有代码
- [ ] 不引入新的第三方依赖（除 `PyJWT`、`alembic` 外）
- [ ] 每个模型字段有简短注释说明用途

---

## 五、测试规范

### 测试目录

```
tests/
├── test_auth_multi.py        # JWT 认证测试
├── test_user_api.py          # 用户管理 API 测试
├── test_user_model.py        # User 模型 CRUD 测试
├── test_middleware.py        # 认证中间件测试
├── test_user_isolation.py    # 数据隔离测试
└── ...                       # 已有测试不改动
```

### 后端测试（pytest）

参考已有测试风格 `tests/test_a_share_fetcher_code_conversion.py` 等。

```python
"""测试 JWT 认证流程"""
import pytest
from fastapi.testclient import TestClient

def test_register_new_user(client: TestClient):
    """注册新用户，返回 JWT token"""
    resp = client.post("/api/v1/auth/register", json={
        "username": "testuser",
        "password": "test123456",
        "email": "test@example.com"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["user"]["username"] == "testuser"

def test_login_with_wrong_password(client: TestClient):
    """错误密码返回 401"""
    resp = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "wrong"
    })
    assert resp.status_code == 401

def test_analysis_isolation(client: TestClient, auth_headers: dict):
    """用户 A 看不到用户 B 的分析记录"""
    ...
```

### 前端测试（Vitest）

参考现有风格 `apps/dsa-web/src/App.test.tsx`。

### 测试运行

```bash
# 后端
cd C:\Users\lu\AppData\Local\Temp\cheentu
python -m pytest tests/ -x -v

# 前端
cd apps/dsa-web
npm run test
```

### 覆盖率要求（最低）

- 新认证模块：≥ 80% 行覆盖
- 新 API 端点：每个端点至少 1 个 Happy Path + 1 个 Error Case
- 数据隔离逻辑：至少 2 个用户各一条记录验证隔离

---

## 六、目录结构（多用户改造新增/修改部分）

```
cheentu/
├── DEVELOPMENT.md                  ← 本文档
├── migrations/                     ← 【新增】Alembic 迁移
│   ├── alembic.ini
│   ├── env.py
│   └── versions/
│       └── 001_initial_users.py
├── src/
│   ├── models/                     ← 【新增】模型目录
│   │   ├── __init__.py
│   │   ├── user.py                 # User 模型
│   │   └── user_config.py          # UserConfig 模型
│   ├── auth_multi.py               ← 【新增】多用户认证
│   ├── auth.py                     ← 保留，不删（兼容 main.py 定时任务）
│   └── storage.py                  ← 修改：加入新模型
├── api/
│   ├── middleware.py               ← 【新增】认证中间件
│   └── v1/
│       ├── router.py               ← 修改：注册 users 路由
│       └── endpoints/
│           ├── auth.py             ← 重写：JWT 登录/注册
│           └── users.py            ← 【新增】用户管理 API
└── apps/dsa-web/src/
    ├── api/
    │   └── auth.ts                 ← 修改：JWT 模式
    ├── pages/
    │   ├── LoginPage.tsx           ← 扩展：注册入口
    │   └── RegisterPage.tsx        ← 【新增】注册页
    └── stores/
        └── authStore.ts            ← 【新增】认证状态
```

---

## 七、工作流

```
1. 本地开发 → 2. 运行测试 → 3. 构建前端 → 4. 打包上传远程
```

```bash
# 本地开发路径
C:\Users\lu\AppData\Local\Temp\cheentu

# 构建前端
cd apps/dsa-web && npm run build

# 运行测试
python -m pytest tests/ -x -v

# 提交
git add -A
git commit -m "feat(scope): 描述"
git push origin feature/multi-user
```