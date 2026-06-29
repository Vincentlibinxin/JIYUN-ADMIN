import React from 'react';
import { Row, Col, Card, Statistic, Tag, Typography } from 'antd';
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
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
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

      {/* 系統狀態：精簡橫向小條，固定在內容區底部 */}
      <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '4px 10px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '6px' }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>{t('dashboard.apiServer') || 'API 伺服器'}</Text>
          <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0, fontSize: '11px', lineHeight: '18px', padding: '0 6px' }}>
            {t('dashboard.operatingNormally') || '正常運作'}
          </Tag>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '4px 10px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '6px' }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>{t('dashboard.dbConnection') || '資料庫連線'}</Text>
          <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0, fontSize: '11px', lineHeight: '18px', padding: '0 6px' }}>
            {t('dashboard.operatingNormally') || '正常運作'}
          </Tag>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '4px 10px', background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: '6px' }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>{t('dashboard.appStatus') || '應用狀態'}</Text>
          <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0, fontSize: '11px', lineHeight: '18px', padding: '0 6px' }}>
            {t('dashboard.running') || '運作中'}
          </Tag>
        </div>
      </div>
    </div>
  );
}
