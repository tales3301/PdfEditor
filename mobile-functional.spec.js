import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, channel: 'msedge', acceptDownloads: true });

test('fluxos principais funcionam no mobile', async ({ page }) => {
  await page.goto('http://localhost:8080/');
  await page.getByLabel('Senha de acesso').fill('2026Plasnorte2026');
  await page.getByRole('button', { name: 'Entrar no sistema' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('canvas')?.width > 0);

  const actionButtons = page.locator('header .actions > button');
  await expect(actionButtons).toHaveCount(7);
  for (const button of await actionButtons.all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }

  await page.getByTitle('Aumentar zoom').click();
  await expect(page.locator('.zoom-controls strong')).toHaveText('85%');
  await page.getByTitle('Diminuir zoom').click();
  await expect(page.locator('.zoom-controls strong')).toHaveText('75%');

  await page.getByLabel('Número do pedido').fill('10428');
  await page.getByLabel('Cliente').fill('Cliente Mobile');
  await page.getByLabel('Linha 1, quantidade').fill('2');
  await page.getByLabel('Linha 1, valorUnitario').fill('10,50');
  await expect(page.getByLabel('Linha 1, valorTotal')).toHaveValue('R$ 21,00');
  await expect(page.getByLabel('Total geral')).toHaveValue('R$ 21,00');
  await page.getByLabel('Condição de pagamento').fill('28 dias');
  await expect(page.getByLabel('Número do pedido')).toHaveValue('10428');
  await expect(page.locator('.auto-save')).toContainText('Alterações salvas', { timeout: 3000 });

  await page.getByTitle('Salvar no histórico').click();
  await page.getByTitle('Ver histórico').click();
  await expect(page.getByRole('dialog', { name: 'Histórico' })).toBeVisible();
  await expect(page.getByText('Cliente Mobile')).toBeVisible();
  await page.getByLabel('Fechar').click();

  const excelDownload = page.waitForEvent('download');
  await page.getByTitle('Exportar planilha').click();
  const excel = await excelDownload;
  expect(excel.suggestedFilename()).toMatch(/^Pedido-10428-Cliente-Mobile-.*\.xlsx$/);

  const pdfDownload = page.waitForEvent('download');
  await page.getByTitle('Exportar documento').click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toMatch(/^Pedido-10428-Cliente-Mobile-.*\.pdf$/);

  await page.getByTitle('Limpar formulário').click();
  await expect(page.getByRole('dialog', { name: 'Limpar formulário?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByLabel('Cliente')).toHaveValue('Cliente Mobile');
});

test('layout compacto e validação funcionam em 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('http://localhost:8080/');
  await page.getByLabel('Senha de acesso').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar no sistema' }).click();
  await expect(page.getByRole('alert')).toContainText('Senha incorreta');
  await page.getByLabel('Senha de acesso').fill('2026Plasnorte2026');
  await page.getByRole('button', { name: 'Entrar no sistema' }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.width > 0);

  const buttons = page.locator('header .actions > button');
  await expect(buttons).toHaveCount(7);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  }

  await expect(page.locator('.zoom-controls strong')).toHaveText('75%');
  await page.getByTitle('Exportar documento').click();
  await expect(page.getByRole('dialog', { name: 'Há informações pendentes' })).toBeVisible();
  await expect(page.getByText('Número do pedido')).toBeVisible();
  await expect(page.getByText('Nome do cliente')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar e preencher' }).click();
  await expect(page.getByRole('dialog', { name: 'Há informações pendentes' })).not.toBeVisible();
});
