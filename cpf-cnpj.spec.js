import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, channel: 'msedge' });

test('formata CPF e CNPJ digitados ou colados sem perder números', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8080' });
  await page.goto('http://127.0.0.1:8080/');
  await page.getByLabel('Senha de acesso').fill('2026Plasnorte2026');
  await page.getByRole('button', { name: 'Entrar no sistema' }).click();

  const field = page.getByLabel('CNPJ/CPF');

  await field.pressSequentially('123.456.789-01');
  await expect(field).toHaveValue('123.456.789-01');

  await field.fill('');
  await field.pressSequentially('12.345.678/0001-90');
  await expect(field).toHaveValue('12.345.678/0001-90');

  await field.fill('');
  await page.evaluate(() => navigator.clipboard.writeText('12345678901'));
  await field.focus();
  await page.keyboard.press('Control+V');
  await expect(field).toHaveValue('123.456.789-01');

  await field.fill('');
  await page.evaluate(() => navigator.clipboard.writeText('12.345.678/0001-90'));
  await field.focus();
  await page.keyboard.press('Control+V');
  await expect(field).toHaveValue('12.345.678/0001-90');
});
