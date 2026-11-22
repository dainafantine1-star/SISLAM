const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const base = 'http://localhost:3400';
const password = fs
  .readFileSync('ACESSO-LOCAL.txt', 'utf8')
  .match(/Senha dos perfis fictícios: (.+)/)[1]
  .trim();
const report = {
  passed: false,
  checks: [],
  screenshots: [],
  pageErrors: [],
  businessData: 'fictional_demo_only',
};
let browser;
async function main() {
  fs.mkdirSync('test-results', { recursive: true });
  browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-proxy-server'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  async function screenshot(name) {
    await page.evaluate(() => document.fonts.ready);
    const file = 'test-results/' + name + '.png';
    await page.screenshot({ path: file, fullPage: true });
    report.screenshots.push(file);
  }
  async function login(slug) {
    await context.clearCookies();
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByLabel('Perfil da demonstração').selectOption(slug + '@demo.sislam.test');
    await page.getByRole('button', { name: 'Entrar no sistema', exact: true }).click();
    await page.waitForURL('**/painel');
    await page.getByRole('heading', { level: 1 }).waitFor();
  }
  async function get(path) {
    const response = await page.request.get(base + '/api/' + path);
    assert(response.ok(), `GET ${path}: ${response.status()}`);
    return response.json();
  }
  async function postAction(path, action) {
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/' + path) && r.request().method() === 'POST',
    );
    await action();
    const result = await response;
    const value = await result.json();
    assert(result.ok(), `${path}: ${result.status()} ${value.error || ''}`);
    return value;
  }
  async function saveModal(path, button = 'Confirmar') {
    const dialog = page.getByRole('dialog');
    const result = await postAction(path, () =>
      dialog.getByRole('button', { name: button, exact: true }).click(),
    );
    await dialog.waitFor({ state: 'hidden' });
    return result;
  }
  async function transition(caseId, name) {
    await page.getByRole('tab', { name: 'Visão geral', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await page
      .getByRole('dialog')
      .getByLabel('Motivo da movimentação')
      .fill('Movimentação fictícia para verificação do fluxo no navegador.');
    await saveModal(`cases/${caseId}/transition`, 'Registrar movimentação');
  }
  await login('admin');
  await page.getByRole('heading', { name: 'Processos recentes', exact: true }).waitFor();
  await screenshot('painel-desktop');
  report.checks.push('administrator_login_and_dashboard');
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot('painel-celular');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Fechar menu', exact: true }).click();
  report.checks.push('mobile_dashboard_drawer_no_horizontal_overflow');
  await page.setViewportSize({ width: 1440, height: 1050 });
  for (const [route, heading] of [
    ['empreendimentos', 'Empreendimentos'],
    ['processos', 'Processos ambientais'],
    ['documentos', 'Documentos'],
    ['licencas', 'Licenças'],
    ['condicionantes', 'Condicionantes'],
    ['notificacoes', 'Notificações'],
    ['arquivo', 'Arquivo digital'],
    ['regras', 'Regras e legislação'],
    ['auditoria', 'Auditoria'],
    ['administracao', 'Administração'],
    ['conta', 'Minha conta'],
  ]) {
    await page.goto(base + '/' + route, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
    assert.equal(await page.getByText('Acesso restrito', { exact: true }).count(), 0);
  }
  report.checks.push('all_administrator_categories_render');
  const doc = await PDFDocument.create();
  doc.addPage();
  const pdf = Buffer.from(await doc.save());
  await login('requerente');
  await page.goto(base + '/processos');
  await page.getByRole('button', { name: 'Novo requerimento', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Empreendimento', { exact: true })
    .selectOption({ label: 'Madeireira Serra Verde (fictícia)' });
  await dialog
    .getByLabel('Objeto do requerimento')
    .fill('Fluxo fictício de verificação pelo navegador');
  await dialog.getByRole('button', { name: 'Criar requerimento', exact: true }).click();
  await page.waitForURL(/\/processos\/[a-f0-9-]{36}$/);
  const caseId = page.url().split('/').at(-1);
  const conditionTitle = 'Relatório fictício de acompanhamento ambiental ' + caseId.slice(0, 8);
  await page.getByRole('button', { name: 'Protocolar requerimento', exact: true }).click();
  await page.getByRole('dialog').getByRole('checkbox').check();
  await saveModal(`cases/${caseId}/file`, 'Confirmar protocolo');
  await page.getByRole('tab', { name: /^Documentos/ }).click();
  for (const [key, title] of [
    ['cadastro', 'Ficha cadastral do requerente'],
    ['memorial', 'Memorial descritivo da atividade'],
  ]) {
    const card = page
      .locator('.document-item')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await postAction(`documents/cases/${caseId}`, () =>
      card
        .locator('input[type=file]')
        .setInputFiles({ name: key + '.pdf', mimeType: 'application/pdf', buffer: pdf }),
    );
    await card.getByText('Enviado', { exact: true }).waitFor();
  }
  const incomplete = await get('cases/' + caseId);
  assert.equal(incomplete.documents.length, 2);
  assert.equal(incomplete.checklist.length, 3);
  report.checks.push('new_application_protocol_and_two_of_three_documents');
  const card = page
    .locator('.document-item')
    .filter({ has: page.getByRole('heading', { name: 'Planta de localização', exact: true }) });
  await postAction(`documents/cases/${caseId}`, () =>
    card
      .locator('input[type=file]')
      .setInputFiles({ name: 'planta.pdf', mimeType: 'application/pdf', buffer: pdf }),
  );
  await card.getByText('Enviado', { exact: true }).waitFor();
  await login('protocolo');
  await page.goto(base + '/processos/' + caseId);
  await transition(caseId, 'Mover para triagem');
  await page.getByRole('tab', { name: /^Documentos/ }).click();
  for (let remaining = 3; remaining > 0; remaining--) {
    await page
      .getByRole('button', { name: 'Registrar recebimento', exact: true })
      .first()
      .waitFor();
    const current = await get('cases/' + caseId),
      target = current.documents.find((d) => d.status === 'sent');
    const docCard = page.locator('.document-item').filter({ hasText: target.filename });
    await postAction(`documents/${target.id}/receive`, () =>
      docCard.getByRole('button', { name: 'Registrar recebimento', exact: true }).click(),
    );
    await docCard.getByText('Recebido', { exact: true }).waitFor();
  }
  await transition(caseId, 'Mover para análise técnica');
  await login('tecnico');
  await page.goto(base + '/processos/' + caseId);
  await page.getByRole('tab', { name: /^Documentos/ }).click();
  for (let remaining = 3; remaining > 0; remaining--) {
    await page.getByRole('button', { name: 'Analisar documento', exact: true }).first().click();
    await page
      .getByRole('dialog')
      .getByLabel('Justificativa técnica')
      .fill('Documento fictício conferido durante a validação do sistema.');
    const current = await get('cases/' + caseId),
      target = current.documents.find((d) => d.status === 'received');
    // The first visible checklist card may differ from document creation order.
    const reviewResponse = page.waitForResponse(
      (r) =>
        /\/api\/documents\/[a-f0-9-]+\/review$/.test(r.url()) && r.request().method() === 'POST',
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Registrar análise técnica', exact: true })
      .click();
    assert((await reviewResponse).ok());
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(
      (n) =>
        Array.from(document.querySelectorAll('button')).filter(
          (b) => b.textContent === 'Analisar documento',
        ).length === n,
      remaining - 1,
    );
  }
  await page.getByRole('tab', { name: 'Análise técnica', exact: true }).click();
  const prepared = page.waitForResponse((r) => r.url().endsWith('/api/cases/' + caseId + '/draft'));
  await page.getByRole('button', { name: 'Preparar minuta', exact: true }).click();
  await prepared;
  await page.waitForFunction(() =>
    document.querySelector('textarea[name=text]')?.value.includes('MINUTA'),
  );
  await page
    .getByLabel('Fundamentação e análise')
    .fill(
      'PARECER DEMONSTRATIVO: os três documentos foram conferidos no cenário fictício. Encaminha-se à revisão da autoridade, sem efeitos jurídicos.',
    );
  await page.getByLabel('Conclusão', { exact: true }).selectOption('favorable');
  await page.getByRole('checkbox').check();
  await postAction(`cases/${caseId}/opinion`, () =>
    page.getByRole('button', { name: 'Registrar versão do parecer', exact: true }).click(),
  );
  await page.getByText('Revisado', { exact: true }).waitFor();
  await transition(caseId, 'Encaminhar à autoridade');
  report.checks.push('protocol_receipt_technical_review_opinion_and_submission');
  await login('autoridade');
  await page.goto(base + '/processos/' + caseId);
  await page.getByRole('tab', { name: 'Licença e condicionantes', exact: true }).click();
  const future = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel('Validade demonstrativa').fill(future);
  await page.getByRole('checkbox').check();
  const license = await postAction(`cases/${caseId}/license`, () =>
    page.getByRole('button', { name: 'Aprovar licença-modelo', exact: true }).click(),
  );
  await page.getByRole('button', { name: 'Publicar modelo', exact: true }).click();
  await page.getByRole('link', { name: 'Verificar código', exact: true }).waitFor();
  const pdfResponse = await page.request.get(base + '/api/licenses/' + license.id + '/pdf');
  assert(pdfResponse.ok());
  assert.equal((await pdfResponse.body()).subarray(0, 5).toString(), '%PDF-');
  const publicResponse = await page.request.get(
    base + '/api/public/license/' + license.verification_code,
  );
  assert.equal((await publicResponse.json()).officialValidity, false);
  report.checks.push('separate_authority_license_model_pdf_and_public_verification');
  await page.getByRole('button', { name: 'Adicionar condicionante', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Obrigação demonstrativa').fill(conditionTitle);
  await page
    .getByRole('dialog')
    .getByLabel('Responsável pelo cumprimento')
    .fill('Responsável fictício');
  await page
    .getByRole('dialog')
    .getByLabel('Data de cumprimento')
    .fill(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  await saveModal(`licenses/${license.id}/conditions`, 'Cadastrar condicionante');
  await screenshot('processo-licenca-modelo');
  await login('requerente');
  await page.goto(base + '/condicionantes');
  const conditionRow = page.getByRole('row').filter({ hasText: conditionTitle });
  await conditionRow.getByRole('button', { name: 'Enviar comprovação', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Arquivo comprobatório')
    .setInputFiles({ name: 'comprovacao.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Enviar comprovação', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await conditionRow.getByText('Comprovação enviada', { exact: true }).waitFor();
  await login('tecnico');
  await page.goto(base + '/condicionantes');
  await page
    .getByRole('row')
    .filter({ hasText: conditionTitle })
    .getByRole('button', { name: 'Analisar comprovação', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Justificativa', { exact: true })
    .fill('Comprovação fictícia analisada e aceita durante o teste.');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Registrar análise', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await conditionRow.getByText('Cumprida', { exact: true }).waitFor();
  report.checks.push('condition_evidence_submitted_and_reviewed');
  await login('admin');
  await page.goto(base + '/auditoria');
  await page.getByRole('button', { name: 'Verificar integridade', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Cadeia íntegra' }).waitFor();
  assert.deepEqual(report.pageErrors, []);
  report.checks.push('audit_chain_and_no_browser_page_errors');
  report.passed = true;
  report.completedAt = new Date().toISOString();
}
main()
  .catch((error) => {
    report.error = error.message.split(password).join('[REDACTED]');
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/browser.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  });
