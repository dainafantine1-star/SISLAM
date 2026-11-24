const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const base = process.env.SISLAM_BROWSER_URL || 'http://localhost:3400';
const password = fs
  .readFileSync(process.env.SISLAM_BROWSER_ACCESS_FILE || 'ACESSO-LOCAL.txt', 'utf8')
  .match(/Senha dos perfis fictícios: (.+)/)[1]
  .trim();
const report = {
  passed: false,
  checks: [],
  screenshots: [],
  pageErrors: [],
  serverErrors: [],
  interactions: [],
  businessData: 'fictional_demo_only',
};
let browser, activePage;
async function main() {
  fs.mkdirSync('test-results', { recursive: true });
  browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-proxy-server'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.exposeBinding('sislamRecordAction', (_source, action) => {
    report.interactions.push(action);
  });
  await context.addInitScript(() => {
    document.addEventListener(
      'click',
      (event) => {
        const control = event.target?.closest?.('button, a, input[type=checkbox]');
        if (!control) return;
        window.sislamRecordAction({
          route: location.pathname,
          control: (control.getAttribute('aria-label') || control.innerText || control.type)
            .trim()
            .slice(0, 200),
        });
      },
      true,
    );
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(45000);
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  page.on('response', (response) => {
    if (response.status() >= 500)
      report.serverErrors.push({ url: response.url(), status: response.status() });
  });
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
    if (!report.checks.includes('login_password_visibility_controls')) {
      await page.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
      assert.equal(await page.getByLabel('Senha', { exact: true }).getAttribute('type'), 'text');
      await page.getByRole('button', { name: 'Ocultar senha', exact: true }).click();
      assert.equal(
        await page.getByLabel('Senha', { exact: true }).getAttribute('type'),
        'password',
      );
      report.checks.push('login_password_visibility_controls');
    }
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
    const [result] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/' + path) && r.request().method() === 'POST',
      ),
      action(),
    ]);
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
  await page.route(
    '**/api/auth/me',
    (route) =>
      route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'The page could not be found\n\nDNS_HOSTNAME_RESOLVED_PRIVATE',
      }),
    { times: 1 },
  );
  await page.goto(base + '/painel', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('alert')
    .filter({ hasText: 'Não foi possível conectar à API do SISLAM' })
    .waitFor();
  assert.equal(await page.getByRole('status').filter({ hasText: 'Carregando' }).count(), 0);
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await page.waitForURL('**/login');
  report.checks.push('plain_text_api_error_and_retry_to_login');
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
    await page.locator('.sidebar a[href="/' + route + '"]').click();
    await page.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
    assert.equal(await page.getByText('Acesso restrito', { exact: true }).count(), 0);
  }
  report.checks.push('all_administrator_categories_render');
  const adminSession = await get('auth/me');
  const homeMunicipality = adminSession.user.municipalityId;
  const otherMunicipality = adminSession.memberships.find((m) => m.id !== homeMunicipality);
  assert(otherMunicipality);
  const homeRegistry = await get('registry');
  const switched = await page.request.post(base + '/api/auth/municipality', {
    headers: { Origin: base },
    data: { municipalityId: otherMunicipality.id },
  });
  assert(switched.ok());
  const isolatedRegistry = await get('registry');
  assert.equal(isolatedRegistry.organizations.length, 1);
  assert.equal(
    isolatedRegistry.organizations.some((o) =>
      homeRegistry.organizations.some((h) => h.id === o.id),
    ),
    false,
  );
  assert(
    (
      await page.request.post(base + '/api/auth/municipality', {
        headers: { Origin: base },
        data: { municipalityId: homeMunicipality },
      })
    ).ok(),
  );
  report.checks.push('hosted_municipality_isolation');
  const doc = await PDFDocument.create();
  doc.addPage();
  const pdf = Buffer.from(await doc.save());
  await login('requerente');
  // Preserve coverage for existing historical cases. New UI-created cases are
  // exercised separately through the complete numbered municipal workflow.
  const historical = (await get('cases')).find((c) => c.status === 'draft' && !c.workflow_step);
  assert(historical, 'A fixture precisa de um rascunho histórico');
  const caseId = historical.id;
  await page.goto(base + '/processos/' + caseId);
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
  const originalDocument = await page.request.get(
    base + '/api/documents/' + incomplete.documents[0].id + '/download',
  );
  assert(originalDocument.ok());
  assert.deepEqual(await originalDocument.body(), pdf);
  report.checks.push('private_encrypted_document_round_trip');
  report.checks.push('historical_application_protocol_and_two_of_three_documents');
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
  await page.getByLabel('Texto da licença-modelo').fill('Texto da licença-modelo informado manualmente para a verificação isolada. Sem validade jurídica.');
  await page.getByRole('checkbox').check();
  const license = await postAction(`cases/${caseId}/license`, () =>
    page.getByRole('button', { name: 'Aprovar licença-modelo', exact: true }).click(),
  );
  await page.getByRole('button', { name: 'Publicar modelo', exact: true }).click();
  await page.getByRole('link', { name: 'Verificar código', exact: true }).waitFor();
  const downloadedLicense = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Baixar PDF-modelo', exact: true }).click();
  assert((await downloadedLicense).suggestedFilename().endsWith('.pdf'));
  await page.getByRole('link', { name: 'Verificar código', exact: true }).click();
  await page.getByRole('heading', { name: 'Verificação de documento', exact: true }).waitFor();
  await page.getByRole('heading', { name: license.number, exact: true }).waitFor();
  await page.goto(base + '/processos/' + caseId);
  await page.getByRole('tab', { name: 'Licença e condicionantes', exact: true }).click();
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
  // Credential and administration scenarios run only in the isolated fixture.
  if (process.env.SISLAM_TEST === '1')
    await require('./browser-extended.cjs')({
      page,
      context,
      base,
      password,
      get,
      postAction,
      saveModal,
      login,
      report,
      caseId,
      pdf,
    });
  await login('admin');
  await page.goto(base + '/auditoria');
  await page.getByRole('button', { name: 'Verificar integridade', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Cadeia íntegra' }).waitFor();
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.serverErrors, []);
  report.checks.push('audit_chain_and_no_browser_page_errors');
  report.passed = true;
  report.coverage = {
    routes: [...new Set(report.interactions.map((action) => action.route))],
    controls: [...new Set(report.interactions.map((action) => action.control))],
    totalInteractions: report.interactions.length,
  };
  report.completedAt = new Date().toISOString();
}
main()
  .catch((error) => {
    report.error = error.message.split(password).join('[REDACTED]');
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!report.passed && activePage && !activePage.isClosed()) {
      report.failedUrl = activePage.url();
      await activePage
        .screenshot({ path: 'test-results/failure.png', fullPage: true })
        .catch(() => {});
      report.visibleErrors = await activePage
        .getByRole('alert')
        .allTextContents()
        .catch(() => []);
    }
    await browser?.close();
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/browser.json', JSON.stringify(report, null, 2));
    console.log(
      JSON.stringify({
        ...report,
        interactions: undefined,
        coverage: report.coverage && {
          routes: report.coverage.routes.length,
          controls: report.coverage.controls.length,
          totalInteractions: report.coverage.totalInteractions,
        },
      }),
    );
  });
