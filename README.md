# 以太坊主网 Gas 价格跟踪器

一个功能完善的命令行工具，用于实时监控以太坊主网的Gas价格并提供智能通知。

## 功能特性

- 🔍 **实时Gas价格查询** - 使用Etherscan API获取最新的Gas价格数据
- 📊 **多档位Gas显示** - 显示慢速(Safe)、标准(Standard)、快速(Fast)三种Gas价格
- 💰 **智能费用计算** - 自动计算简单转账费用（ETH和美元双重显示）
- 💱 **实时汇率获取** - 集成CoinGecko API获取ETH/USD实时汇率，带备用方案
- 🔔 **智能Bark通知** - 当Gas价格低于阈值时自动发送推送到手机📱
- ⏱️ **通知冷却机制** - 防止频繁通知，支持自定义冷却时间

## 安装与配置

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
复制环境变量模板并根据需要修改：
```bash
cp .env.example .env
```

编辑`.env`文件设置以下参数：
```bash
# Bark推送码（可选）- iPhone通知功能
BARK_KEY=your_bark_key_here

# Gas价格阈值（Gwei）- 低于此值时发送通知
GAS_THRESHOLD=1.0

# 通知冷却时间（分钟）- 避免频繁通知
NOTIFICATION_COOLDOWN=30

# 默认查询间隔（分钟）
DEFAULT_INTERVAL=5
```

## 使用方法

### 快速启动
```bash
npm start              # 默认每5分钟查询一次
```

### 命令行参数
```bash
node index.js
```
## 输出示例

```
🚀 Gas价格跟踪器已启动
⏰ 每5分钟自动查询一次
🔔 Bark通知已启用 (阈值: 1.0 Gwei, 冷却: 30分钟)
按 Ctrl+C 退出程序

正在查询Gas价格和ETH汇率...

=== 以太坊主网 Gas 价格 ===
查询时间: 2025/7/30 14:30:25
ETH价格: $3,245.67

🐌 慢速 (Safe):
   Gas价格: 0.85 Gwei
   转账费用: 0.000018 ETH ($0.06)

⚡ 标准 (Standard):
   Gas价格: 1.20 Gwei
   转账费用: 0.000025 ETH ($0.08)

🚀 快速 (Fast):
   Gas价格: 1.50 Gwei
   转账费用: 0.000032 ETH ($0.10)

注: 转账费用基于21000 Gas Limit计算
=====================================

🔔 已发送低Gas价格通知 (0.85 Gwei <= 1.0 Gwei)

📊 最近10次查询平均值:
慢速: 0.95 Gwei ($0.06) | 标准: 1.25 Gwei ($0.08) | 快速: 1.65 Gwei ($0.11)
```

## Bark通知配置

当Gas价格低于设定阈值时，程序会自动发送推送通知到您的iPhone。

### 获取Bark推送码：
1. 在iPhone上下载安装 [Bark App](https://apps.apple.com/app/bark-customed-notifications/id1403753865)
2. 打开Bark应用，复制您的推送码
3. 在项目根目录的`.env`文件中设置：
```bash
BARK_KEY=your_bark_push_key_here
```

### 通知设置：
```bash
GAS_THRESHOLD=1.0            # Gas价格阈值(Gwei)，低于此值时发送通知
NOTIFICATION_COOLDOWN=30     # 通知冷却时间(分钟)，避免频繁通知
```

### 通知功能说明：
- 🎯 **智能触发**：仅当标准Gas价格低于阈值时发送通知
- ⏱️ **冷却保护**：设置冷却时间避免短时间内重复通知
- 📱 **丰富信息**：通知包含当前Gas价格、转账费用(ETH/USD)
- 🔔 **多样化提醒**：支持声音、图标、分组等个性化设置

## 项目结构

```
main-gas/
├── index.js                 # 主程序文件 - 核心Gas跟踪逻辑
├── package.json            # 项目配置和依赖管理
├── package-lock.json       # 依赖版本锁定文件
├── .env.example           # 环境变量配置模板
├── .env                   # 环境变量配置文件（需要创建）
├── .gitignore             # Git忽略文件配置
├── gas_history.json       # 历史记录文件（自动生成）
├── .vscode/               # VS Code配置目录
│   └── tasks.json         # VS Code任务配置
├── node_modules/          # npm依赖包目录
└── README.md              # 项目说明文档
```

## 技术实现

### 核心依赖
- **axios** (^1.11.0) - HTTP请求库，用于API调用
- **node-cron** (^3.0.3) - 定时任务调度
- **dotenv** (^17.2.1) - 环境变量管理
- **@jswork/bark-jssdk** (^1.0.6) - Bark推送通知SDK

### API集成
- **主要数据源**：Etherscan Gas Tracker API
- **ETH价格获取**：CoinGecko API（主要）+ Etherscan API（备用）
- **容错设计**：多重API备用方案，确保服务稳定性

### 核心功能
- **Gas价格计算**：基于21000 Gas Limit的简单转账费用估算
- **智能通知系统**：支持阈值触发、冷却时间、丰富的通知内容
- **多时区支持**：使用中文本地化时间显示

## 注意事项与故障排除

### 环境要求
- **Node.js**：需要支持ES模块的版本（Node.js 14+）
- **网络连接**：需要稳定的互联网连接访问API

### 常见问题
1. **API请求失败**：
   - 检查网络连接
   - Etherscan API可能有频率限制
   - 程序会自动重试并使用备用数据源

2. **通知不工作**：
   - 确认BARK_KEY环境变量已正确设置
   - 检查Bark应用是否正常运行
   - 验证推送码是否有效

3. **历史数据丢失**：
   - 检查`gas_history.json`文件权限
   - 确保程序有写入当前目录的权限

### 性能优化
- 程序自动限制历史记录数量（最多100条）
- 使用并发请求同时获取Gas价格和ETH汇率
- 智能缓存ETH价格，减少API调用

### 安全建议
- 将`.env`文件添加到`.gitignore`避免泄露推送码
- 定期更新依赖包以获取安全补丁
- 合理设置通知冷却时间避免过度通知

## 许可证

本项目采用 MIT 许可证 - 详见项目中的许可证文件。

## 更新日志

### v1.0.0
- ✨ 实时Gas价格查询功能
- ✨ 多档位Gas价格显示（慢速/标准/快速）
- ✨ ETH/USD费用计算
- ✨ Bark推送通知集成
- ✨ 历史记录和统计分析
- ✨ 灵活的查询间隔设置
