const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const base = process.env.SISLAM_BROWSER_URL || 'http://localhost:3400';
const password = process.env.SISLAM_BROWSER_PASSWORD;
const report = { passed: false, checks: [], screenshots: [], pageErrors: [], serverErrors: [] };
async function main() {
  if (!password || process.env.SISLAM_TEST !== '1')
    throw new Error('O teste manual exige a base isolada.');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-proxy-server'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', (e) => report.pageErrors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 500) report.serverErrors.push(r.status());
    });
    const dialog = page.getByRole('dialog');
    const field = (name) => dialog.getByLabel(name, { exact: true });
    const button = (name) => page.getByRole('button', { name, exact: true });
    async function login(slug) {
      await context.clearCookies();
      await page.goto(base + '/login');
      await page.getByLabel('Perfil da demonstração').selectOption(slug + '@demo.sislam.test');
      await page.getByLabel('Senha', { exact: true }).fill(password);
      await button('Entrar no sistema').click();
      await page.waitForURL('**/painel');
      await page.getByRole('heading', { level: 1 }).waitFor();
    }
    async function get(path) {
      const r = await page.request.get(base + '/api/' + path);
      assert(r.ok(), path);
      return r.json();
    }
    async function postAction(path, action) {
      const [r] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().endsWith('/api/' + path) && r.request().method() === 'POST',
        ),
        action(),
      ]);
      const data = await r.json();
      assert(r.ok(), path + ': ' + JSON.stringify(data));
      return data;
    }
    async function saveModal(path, name) {
      const data = await postAction(path, () =>
        dialog.getByRole('button', { name, exact: true }).click(),
      );
      await dialog.waitFor({ state: 'hidden' });
      return data;
    }
    await login('requerente');
    assert.equal((await get('dashboard')).counts.processes, 0);
    assert.deepEqual(await get('registry'), { organizations: [], establishments: [] });
    assert.deepEqual(await get('rules'), []);
    await page.getByRole('heading', { name: 'Pronto para começar', exact: true }).waitFor();
    await page.reload();
    assert.equal((await get('cases')).length, 0);
    report.checks.push('empty_workspace_without_automatic_examples');
    await page.goto(base + '/empreendimentos');
    await button('Nova organização').click();
    assert.equal(await field('Razão social / nome').inputValue(), '');
    await field('Razão social / nome').fill('Cadastro manual da suíte isolada');
    await field('CNPJ ou identificador da organização').fill('MANUAL-UI-2026');
    await field('Responsável legal').fill('Responsável digitado no formulário');
    const org = await saveModal('registry/organizations', 'Salvar cadastro');
    await button('Novo empreendimento').click();
    await field('Organização').selectOption(org.id);
    assert.equal(await field('Atividade / código de enquadramento').inputValue(), '');
    await field('Nome do empreendimento').fill('Unidade cadastrada sem atividade de exemplo');
    await field('Atividade / código de enquadramento').fill('ATIVIDADE-MANUAL');
    await field('Endereço e localização').fill('Endereço informado manualmente no teste isolado');
    await field('Capacidade instalada').fill('42.5');
    await field('Unidade da capacidade instalada').fill('toneladas/mês');
    await field('Área do empreendimento (m²)').fill('150.75');
    const site = await saveModal('registry/establishments', 'Salvar cadastro');
    assert.equal(site.capacity_unit, 'toneladas/mês');
    await page.goto(base + '/processos?novo=1');
    await field('Empreendimento').selectOption(site.id);
    await field('Objeto do requerimento').fill('Teste do requerimento digitado manualmente');
    await dialog.getByRole('button', { name: 'Criar requerimento', exact: true }).click();
    await page.waitForURL(/\/processos\/[a-f0-9-]{36}$/);
    const id = page.url().split('/').at(-1);
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await require('./browser-municipal.cjs')({
      page,
      base,
      id,
      suffix: 'manual',
      login,
      get,
      postAction,
      saveModal,
      pdf: Buffer.from(await pdf.save()),
      report,
      manual: true,
    });
    assert.equal((await get('cases/' + id)).rule_snapshot, null);
    report.checks.push('manual_activity_capacity_unit_classification_documents_and_all_25_stages');
    await login('admin');
    await page.goto(base + '/regras');
    await button('Nova versão de regra').click();
    assert.equal(await field('Código de atividade').inputValue(), '');
    assert.equal(await field('Porte da faixa 1').inputValue(), '');
    await field('Código de atividade').fill('ATIVIDADE-MANUAL');
    await field('Título da revisão').fill('Regra informada manualmente no teste');
    await field('Vigência inicial').fill('2026-01-01');
    await field('Unidade de medida da capacidade').fill('toneladas/mês');
    await field('Referência / origem da revisão').fill(
      'Referência informada somente para o teste isolado, sem validade normativa.',
    );
    await field('Limite superior da faixa 1').fill('100');
    await field('Porte da faixa 1').fill('Porte conferido');
    await field('Potencial poluidor da faixa 1').selectOption('baixo');
    await field('Modalidade da faixa 1').fill('Procedimento de teste');
    await field('Chave do documento 1').fill('arquivo');
    await field('Nome do documento 1').fill('Documento informado');
    await field('Exigência do documento 1').selectOption('required');
    const rule = await saveModal('rules', 'Salvar nova versão');
    assert.equal(rule.definition.bands[0].max, 100);
    assert.equal((await get('cases/' + id)).rule_snapshot, null);
    assert.equal((await get('registry')).organizations.length, 1);
    report.checks.push('rule_bands_documents_and_references_entered_through_fields_without_json');
    await page.goto(base + '/auditoria');
    await button('Verificar integridade').click();
    await page.getByRole('status').filter({ hasText: 'Cadeia íntegra' }).waitFor();
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.serverErrors, []);
    report.passed = true;
    await context.close();
  } finally {
    await browser.close();
    fs.writeFileSync('test-results/browser-manual.json', JSON.stringify(report, null, 2));
  }
}
main()
  .then(() => console.log(JSON.stringify(report)))
  .catch((e) => {
    console.error(e.message?.split(password).join('[redigido]'));
    process.exitCode = 1;
  });
