import { expect, test } from '@playwright/test';

test('admin can log in, create a channel, create a token, and inspect request logs', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  await page.getByLabel('邮箱').fill('admin@example.com');
  await page.getByLabel('密码').fill('Admin123!Admin123!');
  await page.getByRole('button', { name: '登录' }).click();

  await expect(page.getByText('路由控制台概览')).toBeVisible();

  await page.goto('/channels');
  await expect(page.getByRole('heading', { name: '渠道策略' })).toBeVisible();
  await page.getByRole('button', { name: '新增渠道' }).click();
  await page.getByLabel('渠道名称').fill('E2E 主渠道');
  await page.getByLabel('Base URL').fill('http://127.0.0.1:4010/v1');
  await page.getByLabel('API Key').fill('sk-test');
  await page.getByLabel('默认模型').fill('gpt-4.1-mini');
  await page.getByRole('button', { name: '保存渠道' }).click();

  const channelRow = page.getByRole('row', { name: /E2E 主渠道/i });
  await expect(channelRow).toBeVisible();
  await channelRow.getByRole('button', { name: '测试渠道' }).click();
  await expect(channelRow.getByText('最近测试通过')).toBeVisible();

  await page.getByLabel('逻辑模型别名').fill('e2e-responses');
  await page.getByLabel('说明').fill('E2E 路由');
  await page.getByLabel('关联渠道').selectOption({ label: 'E2E 主渠道' });
  await page.getByLabel('上游模型').fill('gpt-4.1-mini');
  await page.getByLabel('输入价格').fill('1.2500');
  await page.getByLabel('输出价格').fill('4.5000');
  await page.getByLabel('币种').fill('USD');
  await page.getByLabel('优先级').fill('1');
  await page.getByRole('button', { name: '保存逻辑模型' }).click();

  await expect(page.getByText('e2e-responses')).toBeVisible();

  await page.goto('/tokens');
  await expect(page.getByRole('heading', { name: '令牌管理' })).toBeVisible();
  await page.getByRole('button', { name: '新建令牌' }).click();
  await page.getByLabel('令牌名称').fill('E2E SDK');
  await page.getByLabel('逻辑模型').selectOption({ label: 'e2e-responses' });
  await page.getByLabel('预算上限').fill('50.00');
  await page.getByLabel('过期时间').fill('2026-10-01T08:30');
  await page.getByRole('button', { name: '创建令牌' }).click();

  const rawTokenLocator = page.getByText(/rt_[0-9a-f]{48}/).first();
  await expect(rawTokenLocator).toBeVisible();
  const rawToken = (await rawTokenLocator.textContent()) ?? '';

  const gatewayResponse = await request.post('/v1/responses', {
    data: {
      model: 'e2e-responses',
      input: 'hello from playwright',
    },
    headers: {
      authorization: `Bearer ${rawToken.trim()}`,
      'content-type': 'application/json',
    },
  });

  expect(gatewayResponse.ok()).toBeTruthy();

  await page.goto('/logs');
  await expect(page.getByRole('heading', { name: '请求日志' })).toBeVisible();
  const logRow = page.getByRole('row', { name: /responses/i }).first();
  await expect(logRow).toContainText('e2e-responses');
  await logRow.getByRole('link', { name: '查看详情' }).click();

  await expect(page.getByRole('heading', { name: '请求详情' })).toBeVisible();
  await expect(page.getByText('价格解释')).toBeVisible();
  await expect(page.getByText('E2E 主渠道').first()).toBeVisible();
  await expect(page.getByText('e2e-responses').first()).toBeVisible();
});
