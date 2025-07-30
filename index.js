import axios from 'axios';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import Bark from '@jswork/bark-jssdk';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

class GasTracker {
    constructor() {
        this.apiUrl = 'https://api.etherscan.io/api';
        this.logFile = 'gas_history.json';
        this.history = this.loadHistory();
        this.ethPrice = 0; // ETH/USD价格缓存
        
        // 从环境变量读取配置
        this.gasThreshold = parseFloat(process.env.GAS_THRESHOLD) || 1.0; // Gas价格阈值（Gwei）
        this.lastNotificationTime = 0; // 上次通知时间，避免频繁通知
        this.notificationCooldown = (parseInt(process.env.NOTIFICATION_COOLDOWN) || 30) * 60 * 1000; // 通知冷却时间
        
        // Bark配置 - 您需要设置您的Bark推送码
        this.barkKey = process.env.BARK_KEY || null; // 从环境变量获取Bark推送码
        if (this.barkKey) {
            this.bark = new Bark({ sdkKey: this.barkKey });
            console.log(`🔔 Bark通知已启用 (阈值: ${this.gasThreshold} Gwei, 冷却: ${this.notificationCooldown/60000}分钟)`);
        } else {
            console.log('⚠️  未设置BARK_KEY环境变量，通知功能已禁用');
            console.log('💡 使用方法: export BARK_KEY=your_bark_key');
            console.log('💡 或者创建.env文件并设置BARK_KEY=your_bark_key');
        }
    }

    // 加载历史记录
    loadHistory() {
        try {
            if (fs.existsSync(this.logFile)) {
                const data = fs.readFileSync(this.logFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('加载历史记录失败:', error.message);
        }
        return [];
    }

    // 保存历史记录
    saveHistory() {
        try {
            // 只保留最近100条记录
            if (this.history.length > 100) {
                this.history = this.history.slice(-100);
            }
            fs.writeFileSync(this.logFile, JSON.stringify(this.history, null, 2));
        } catch (error) {
            console.error('保存历史记录失败:', error.message);
        }
    }

    // 将Wei转换为Gwei
    weiToGwei(wei) {
        return Math.round(wei / 1000000000);
    }

    // 获取ETH价格（美元）
    async getEthPrice() {
        try {
            // 首先尝试使用CoinGecko API（免费且稳定）
            const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                params: {
                    ids: 'ethereum',
                    vs_currencies: 'usd'
                },
                timeout: 10000
            });

            if (response.data && response.data.ethereum && response.data.ethereum.usd) {
                this.ethPrice = response.data.ethereum.usd;
                return this.ethPrice;
            } else {
                throw new Error('CoinGecko API返回格式错误');
            }
        } catch (error) {
            console.error('获取ETH价格失败 (CoinGecko):', error.message);
            
            // 备用方案：尝试使用Etherscan API
            try {
                const response = await axios.get(this.apiUrl, {
                    params: {
                        module: 'stats',
                        action: 'ethprice'
                    },
                    timeout: 5000
                });

                if (response.data.status === '1') {
                    this.ethPrice = parseFloat(response.data.result.ethusd);
                    return this.ethPrice;
                }
            } catch (backupError) {
                console.error('备用ETH价格API也失败:', backupError.message);
            }
            
            // 如果都失败，使用缓存的价格或默认价格
            const fallbackPrice = this.ethPrice || 3000;
            console.log(`使用备用价格: $${fallbackPrice}`);
            return fallbackPrice;
        }
    }

    // 查询Gas价格
    async getGasPrice() {
        try {
            const response = await axios.get(this.apiUrl, {
                params: {
                    module: 'gastracker',
                    action: 'gasoracle'
                },
                timeout: 10000
            });

            if (response.data.status === '1') {
                const result = response.data.result;
                // 确保所有价格都是有效数字
                return {
                    SafeGasPrice: result.SafeGasPrice || result.ProposeGasPrice || '0',
                    StandardGasPrice: result.StandardGasPrice || result.ProposeGasPrice || result.SafeGasPrice || '0',
                    FastGasPrice: result.FastGasPrice || result.ProposeGasPrice || '0',
                    ProposeGasPrice: result.ProposeGasPrice || '0'
                };
            } else {
                throw new Error('API返回错误: ' + response.data.message);
            }
        } catch (error) {
            console.error('获取Gas价格失败:', error.message);
            return null;
        }
    }

    // 估算交易费用（基于21000 gas limit的简单转账）
    calculateTransactionFee(gasPriceGwei, ethPriceUsd = this.ethPrice) {
        const gasLimit = 21000; // 简单转账的gas limit
        const feeInGwei = gasLimit * gasPriceGwei;
        const feeInEth = feeInGwei / 1000000000; // 转换为ETH
        const feeInUsd = feeInEth * ethPriceUsd; // 转换为美元
        return {
            gwei: feeInGwei,
            eth: feeInEth.toFixed(6),
            usd: feeInUsd.toFixed(2)
        };
    }

    // 发送Bark通知
    async sendNotification(title, message, options = {}) {
        if (!this.bark || !this.barkKey) {
            console.log('📵 Bark未配置，跳过通知');
            return false;
        }

        try {
            await this.bark.notify({
                title: title,
                body: message,
                sound: options.sound || 'bell',
                icon: options.icon || '⛽',
                group: options.group || 'gas-tracker',
                level: options.level || 'active',
                badge: options.badge || 1,
                url: options.url || ''
            });
            console.log('🔔 通知已发送:', title);
            return true;
        } catch (error) {
            console.error('❌ 发送通知失败:', error.message);
            return false;
        }
    }

    // 检查是否需要发送低Gas价格通知
    async checkAndNotifyLowGas(gasData, ethPriceUsd) {
        const safePrice = parseFloat(gasData.SafeGasPrice);
        const standardPrice = parseFloat(gasData.StandardGasPrice);
        const fastPrice = parseFloat(gasData.FastGasPrice);
        
        // 检查标准Gas价格是否低于阈值
        if (standardPrice <= this.gasThreshold) {
            const now = Date.now();
            
            // 检查冷却时间，避免频繁通知
            if (now - this.lastNotificationTime > this.notificationCooldown) {
                // 计算三种价格的转账费用
                const safeFee = this.calculateTransactionFee(safePrice, ethPriceUsd);
                const standardFee = this.calculateTransactionFee(standardPrice, ethPriceUsd);
                const fastFee = this.calculateTransactionFee(fastPrice, ethPriceUsd);
                
                const title = `🎉 Gas价格超低！`;
                const message = `当前Gas价格触发通知 (≤${this.gasThreshold} Gwei)\n\n🐌 慢速: ${safePrice.toFixed(2)} Gwei\n   费用: ${safeFee.eth} ETH ($${safeFee.usd})\n\n⚡ 标准: ${standardPrice.toFixed(2)} Gwei\n   费用: ${standardFee.eth} ETH ($${standardFee.usd})\n\n🚀 快速: ${fastPrice.toFixed(2)} Gwei\n   费用: ${fastFee.eth} ETH ($${fastFee.usd})\n\n现在是交易的好时机！`;
                
                const sent = await this.sendNotification(title, message, {
                    sound: 'bell',
                    icon: '🚀',
                    level: 'critical',  // 重要通知
                    badge: 1,
                    group: 'gas-tracker'
                });
                
                if (sent) {
                    this.lastNotificationTime = now;
                    console.log(`🔔 已发送低Gas价格通知 (${standardPrice.toFixed(2)} Gwei <= ${this.gasThreshold} Gwei)`);
                }
            } else {
                const remainingTime = Math.ceil((this.notificationCooldown - (now - this.lastNotificationTime)) / 1000 / 60);
                console.log(`⏰ Gas价格仍然很低 (${standardPrice.toFixed(2)} Gwei)，但通知冷却中 (剩余${remainingTime}分钟)`);
            }
        }
    }

    // 格式化显示Gas信息
    async formatGasInfo(gasData, ethPriceUsd) {
        const timestamp = new Date().toLocaleString('zh-CN');
        const safePrice = parseFloat(gasData.SafeGasPrice);
        const standardPrice = parseFloat(gasData.StandardGasPrice);
        const fastPrice = parseFloat(gasData.FastGasPrice);
        
        const slowFee = this.calculateTransactionFee(safePrice, ethPriceUsd);
        const standardFee = this.calculateTransactionFee(standardPrice, ethPriceUsd);
        const fastFee = this.calculateTransactionFee(fastPrice, ethPriceUsd);

        console.log('\n=== 以太坊主网 Gas 价格 ===');
        console.log(`查询时间: ${timestamp}`);
        console.log(`ETH价格: $${ethPriceUsd.toFixed(2)}`);
        console.log('');
        console.log('🐌 慢速 (Safe):');
        console.log(`   Gas价格: ${safePrice.toFixed(2)} Gwei`);
        console.log(`   转账费用: ${slowFee.eth} ETH ($${slowFee.usd})`);
        console.log('');
        console.log('⚡ 标准 (Standard):');
        console.log(`   Gas价格: ${standardPrice.toFixed(2)} Gwei`);
        console.log(`   转账费用: ${standardFee.eth} ETH ($${standardFee.usd})`);
        console.log('');
        console.log('🚀 快速 (Fast):');
        console.log(`   Gas价格: ${fastPrice.toFixed(2)} Gwei`);
        console.log(`   转账费用: ${fastFee.eth} ETH ($${fastFee.usd})`);
        console.log('');
        console.log('注: 转账费用基于21000 Gas Limit计算');
        console.log('=====================================\n');
        // 保存到历史记录
        // this.history.push({
        //     timestamp: new Date().toISOString(),
        //     safe: Math.round(safePrice * 100) / 100,
        //     standard: Math.round(standardPrice * 100) / 100,
        //     fast: Math.round(fastPrice * 100) / 100,
        //     ethPrice: Math.round(ethPriceUsd * 100) / 100,
        //     safeFeeUsd: parseFloat(slowFee.usd),
        //     standardFeeUsd: parseFloat(standardFee.usd),
        //     fastFeeUsd: parseFloat(fastFee.usd)
        // });
        // this.saveHistory();
        
        // 检查是否需要发送低Gas价格通知
        await this.checkAndNotifyLowGas(gasData, ethPriceUsd);
    }

    // 显示历史统计信息
    showHistoryStats() {
        if (this.history.length === 0) {
            console.log('暂无历史数据');
            return;
        }

        const recent = this.history.slice(-10); // 最近10条记录
        const avgSafe = (recent.reduce((sum, item) => sum + item.safe, 0) / recent.length).toFixed(2);
        const avgStandard = (recent.reduce((sum, item) => sum + item.standard, 0) / recent.length).toFixed(2);
        const avgFast = (recent.reduce((sum, item) => sum + item.fast, 0) / recent.length).toFixed(2);
        
        // 计算美元费用平均值（如果有数据的话）
        const recentWithUsd = recent.filter(item => item.safeFeeUsd !== undefined);
        if (recentWithUsd.length > 0) {
            const avgSafeUsd = (recentWithUsd.reduce((sum, item) => sum + item.safeFeeUsd, 0) / recentWithUsd.length).toFixed(2);
            const avgStandardUsd = (recentWithUsd.reduce((sum, item) => sum + item.standardFeeUsd, 0) / recentWithUsd.length).toFixed(2);
            const avgFastUsd = (recentWithUsd.reduce((sum, item) => sum + item.fastFeeUsd, 0) / recentWithUsd.length).toFixed(2);
            
            console.log('\n📊 最近10次查询平均值:');
            console.log(`慢速: ${avgSafe} Gwei ($${avgSafeUsd}) | 标准: ${avgStandard} Gwei ($${avgStandardUsd}) | 快速: ${avgFast} Gwei ($${avgFastUsd})`);
        } else {
            console.log('\n📊 最近10次查询平均值:');
            console.log(`慢速: ${avgSafe} Gwei | 标准: ${avgStandard} Gwei | 快速: ${avgFast} Gwei`);
        }
    }

    // 执行一次查询
    async queryOnce() {
        console.log('正在查询Gas价格和ETH汇率...');
        
        // 同时获取Gas价格和ETH价格
        const [gasData, ethPrice] = await Promise.all([
            this.getGasPrice(),
            this.getEthPrice()
        ]);
        
        if (gasData && ethPrice) {
            await this.formatGasInfo(gasData, ethPrice);
            this.showHistoryStats();
        } else {
            console.log('❌ 查询失败，请稍后重试');
        }
    }

    // 启动定时查询
    startScheduledQuery(intervalMinutes = 5) {
        console.log(`🚀 Gas价格跟踪器已启动`);
        console.log(`⏰ 每${intervalMinutes}分钟自动查询一次`);
        console.log(`📁 历史记录保存在: ${this.logFile}`);
        console.log('按 Ctrl+C 退出程序\n');

        // 立即执行一次查询
        this.queryOnce();

        // 设置定时任务
        const cronPattern = `*/${intervalMinutes} * * * *`;
        cron.schedule(cronPattern, () => {
            this.queryOnce();
        });
    }
}
const gasTracker = new GasTracker();

gasTracker.startScheduledQuery(process.env.DEFAULT_INTERVAL || 1);


// 优雅退出
process.on('SIGINT', () => {
    console.log('\n\n👋 程序已退出，感谢使用！');
    process.exit(0);
});
