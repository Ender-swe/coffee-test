import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', route => route.fulfill({ json: { user: null } }));
});
test('guest can shop, change shipping, and reach payment without an account', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/shop.html');
  await page.getByRole('button', { name: 'Add to your bag' }).first().click();
  await page.getByRole('button', { name: 'Add to your bag' }).nth(1).click();
  await page.getByRole('link', { name: 'Shopping bag' }).click();
  await expect(page.getByText('Checkout as a guest. An account is always optional.')).toBeVisible();
  await expect(page.locator('.grand-total dd')).toContainText('$40.00');
  await page.getByRole('radio', { name: /A little sooner/ }).check();
  await expect(page.locator('.grand-total dd')).toContainText('$49.95');
  await page.getByLabel('Full name').fill('Alex Guest');
  await page.getByLabel('Email address').fill('guest@example.com');
  await page.screenshot({ path: `test-results/checkout-${info.project.name}.png`, fullPage: true });
  let requestBody;
  await page.route('**/api/checkout', route => {
    requestBody = route.request().postDataJSON();
    return route.fulfill({ json: { url: 'https://checkout.stripe.com/c/pay/test' } });
  });
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Stripe payment step</h1>' }));
  await page.getByRole('button', { name: 'Continue to secure payment' }).click();
  await expect(page).toHaveURL(/checkout.stripe.com/);
  expect(requestBody.email).toBe('guest@example.com');
  expect(requestBody.shipping).toBe('express');
  expect(requestBody.items).toEqual([{ id: 'daily-blend', quantity: 1 }, { id: 'sunday-origin', quantity: 1 }]);
  expect(requestBody.password).toBeUndefined();
  expect(errors).toEqual([]);
});
test('bag survives optional signup, form validates and password visibility works', async ({ page }, info) => {
  await page.goto('/shop.html');
  await page.getByRole('button', { name: 'Add to your bag' }).first().click();
  await page.goto('/signup.html?next=checkout');
  await page.getByLabel('Your name').fill('Alex Regular');
  await page.getByLabel('Email address').fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a lovely long password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(page.getByRole('link', { name: 'Continue as a guest' })).toBeVisible();
  await page.screenshot({ path: `test-results/signup-${info.project.name}.png`, fullPage: true });
  await page.route('**/api/auth/signup', route => route.fulfill({ status: 201, json: { user: { id: 'test', name: 'Alex Regular', email: 'alex@example.com' } } }));
  await page.getByRole('button', { name: 'Make yourself at home' }).click();
  await expect(page).toHaveURL(/checkout.html/);
  await expect(page.locator('.bag-item h3')).toHaveText('The daily ritual');
});
test('login shows recoverable errors and offers guest checkout', async ({ page }, info) => {
  await page.goto('/login.html');
  await page.route('**/api/auth/login', route => route.fulfill({ status: 401, json: { error: 'That email and password do not match. Please try again.' } }));
  await page.getByLabel('Email address').fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('wrong password');
  await page.getByRole('button', { name: 'Let’s get you settled' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await expect(page.getByRole('button', { name: 'Let’s get you settled' })).toBeEnabled();
  await page.screenshot({ path: `test-results/login-${info.project.name}.png`, fullPage: true });
  await page.getByRole('link', { name: 'Continue as a guest' }).click();
  await expect(page.getByText('Your bag is waiting for a new favorite.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to secure payment' })).toBeDisabled();
});
test('payment failure preserves bag and pages fit the viewport', async ({ page }) => {
  await page.goto('/shop.html');
  await page.getByRole('button', { name: 'Add to your bag' }).first().click();
  await page.goto('/checkout.html?canceled=1');
  await page.getByLabel('Full name').fill('Alex Guest');
  await page.getByLabel('Email address').fill('guest@example.com');
  await page.route('**/api/checkout', route => route.fulfill({ status: 503, json: { error: 'Payments are not available just yet. Your bag is saved; please try again soon.' } }));
  await page.getByRole('button', { name: 'Continue to secure payment' }).click();
  await expect(page.getByRole('alert')).toContainText('Your bag is saved');
  await expect(page.locator('.bag-item')).toHaveCount(1);
  for (const path of ['/checkout.html', '/signup.html', '/login.html', '/shop.html']) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});
test('confirmation requires server-confirmed payment and clears purchased items once', async ({ page }) => {
  const id = '12345678-1234-4234-8234-123456789abc';
  await page.goto('/shop.html');
  await page.getByRole('button', { name: 'Add to your bag' }).first().click();
  await page.evaluate(id => sessionStorage.setItem(`orlast-order-${id}`, JSON.stringify({ token: 'a'.repeat(64), items: [{ id: 'daily-blend', quantity: 1 }] })), id);
  await page.route(`**/api/orders/${id}`, route => route.fulfill({ json: { order: { id, status: 'paid', total: 2295, items: [{ name: 'The daily ritual', quantity: 1, price: 1800 }] } } }));
  await page.goto(`/order.html?order=${id}`);
  await expect(page.getByText('Payment received.', { exact: false })).toBeVisible();
  await expect(page.locator('#bag-count')).toHaveText('0');
  await page.reload();
  await expect(page.locator('#bag-count')).toHaveText('0');
});
