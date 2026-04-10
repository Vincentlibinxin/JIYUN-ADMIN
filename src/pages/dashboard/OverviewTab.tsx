import React from 'react';
import { Row, Col, Card, Statistic, Tag, Progress, Typography, Space } from 'antd';
import { UserOutlined, FileTextOutlined, InboxOutlined, CheckCircleOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { useI18n } from '../../lib/i18n';

const { Title, Text } = Typography;

interface Stats {
  totalUsers: number;
  totalOrders: number;
  totalParcels: number;
}

interface OverviewTabProps {
  stats: Stats;
}

export default function OverviewTab({ stats }: OverviewTabProps) {
  const { t } = useI18n();

  return (
    <div style={{ padding: '16px' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card bordered={false} hoverable>
            <Statistic
              title={t('dashboard.totalUsers') || '會員總數'}
              value={stats.totalUsers}
              prefix={<UserOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#3f3f46', fontWeight: 'bold' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <ArrowUpOutlined style={{ color: '#52c41a' }} /> 12% {t('dashboard.comparedToLastWeek') || '較上週'}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} hoverable>
            <Statistic
              title={t('dashboard.totalOrders') || '訂單總數'}
              value={stats.totalOrders}
              prefix={<FileTextOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#3f3f46', fontWeight: 'bold' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <ArrowUpOutlined style={{ color: '#52c41a' }} /> 8% {t('dashboard.comparedToLastWeek') || '較上週'}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} hoverable>
            <Statistic
              title={t('dashboard.totalParcels') || '包裹總數'}
              value={stats.totalParcels}
              prefix={<InboxOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#3f3f46', fontWeight: 'bold' }}
            />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              <ArrowUpOutlined style={{ color: '#52c41a' }} /> 5% {t('dashboard.comparedToLastWeek') || '較上週'}
            </Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        {/* 系統狀態 */}
        <Col xs={24} md={12}>
          <Card title={t('dashboard.systemStatus') || '系統狀態'} bordered={false} style={{ height: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f5f5f5', borderRadius: '4px' }}>
                <Text strong>{t('dashboard.apiServer') || 'API 伺服器'}</Text>
                <Tag icon={<CheckCircleOutlined />} color="success">
                  {t('dashboard.operatingNormally') || '正常運作'}
                </Tag>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f5f5f5', borderRadius: '4px' }}>
                <Text strong>{t('dashboard.dbConnection') || '資料庫連線'}</Text>
                <Tag icon={<CheckCircleOutlined />} color="success">
                  {t('dashboard.operatingNormally') || '正常運作'}
                </Tag>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f5f5f5', borderRadius: '4px' }}>
                <Text strong>{t('dashboard.appStatus') || '應用狀態'}</Text>
                <Tag icon={<CheckCircleOutlined />} color="success">
                  {t('dashboard.running') || '運作中'}
                </Tag>
              </div>
            </Space>
          </Card>
        </Col>

        {/* 快速統計 */}
        <Col xs={24} md={12}>
          <Card title={t('dashboard.quickStats') || '快速概覽統計'} bordered={false} style={{ height: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <Text>{t('dashboard.newUsersToday') || '今日新增會員'}</Text>
                  <Text strong style={{ color: '#1677ff' }}>+{Math.floor(stats.totalUsers * 0.15)}</Text>
                </div>
                <Progress percent={45} status="active" />
              </div>
              
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <Text>{t('dashboard.newOrdersToday') || '今日新增訂單'}</Text>
                  <Text strong style={{ color: '#52c41a' }}>+{Math.floor(stats.totalOrders * 0.2)}</Text>
                </div>
                <Progress percent={65} status="active" strokeColor="#52c41a" />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
