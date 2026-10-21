import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, channel: 'msedge' });

test('permite visualizar a senha e confirmar a saída', async ({ page }) => {
  await page.goto('http://127.0.0.1:8080/');

  const password = page.getByLabel('Senha de acesso');
  await expect(password).toHaveAttribute('type', 'password');
  await password.fill('2026Plasnorte2026');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar senha' }).click();
  await expect(password).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: 'Entrar no sistema' }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Deseja realmente sair?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByLabel('CNPJ/CPF')).toBeVisible();

  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, sair' }).click();
  await expect(page.getByRole('heading', { name: 'Editor de pedidos' })).toBeVisible();
  await expect(password).toHaveValue('');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('plasnorte-acesso-autorizado'))).toBeNull();
});
