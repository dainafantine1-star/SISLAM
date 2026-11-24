const assert = require('node:assert/strict');

module.exports = async function municipal({
  page,
  base,
  id,
  suffix,
  login,
  get,
  postAction,
  saveModal,
  pdf,
  report,
  manual = false,
}) {
  let currentRole = 'applicant';
  const slugs = { applicant: 'requerente', protocol: 'protocolo', analyst: 'tecnico' };
  const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
  const dialog = page.getByRole('dialog');
  async function as(role) {
    if (role !== currentRole) {
      await login(slugs[role]);
      currentRole = role;
      await page.goto(base + '/processos/' + id);
    }
  }
  async function stage(expected, action = 'complete', options = {}) {
    const c = await get('cases/' + id);
    assert.equal(c.workflow_step, expected);
    await as(c.workflow.current.role);
    await button(c.workflow.current.actions.find((a) => a.id === action).label).click();
    await dialog
      .getByRole('textbox')
      .first()
      .fill('Registro fictício detalhado para demonstrar esta etapa na sequência municipal.');
    if (options.reference)
      await dialog
        .getByLabel(
          expected === '4'
            ? 'Referência conferida para competência (demonstrativa)'
            : 'Referência da taxa simulada',
          { exact: true },
        )
        .fill(options.reference);
    if (options.amount)
      await dialog
        .getByLabel('Valor da taxa simulada (R$)', { exact: true })
        .fill(String(options.amount));
    if (options.file)
      await dialog
        .locator('input[type=file]')
        .setInputFiles({ name: options.file + '.pdf', mimeType: 'application/pdf', buffer: pdf });
    await dialog.getByRole('checkbox').check();
    await saveModal('cases/' + id + '/workflow', 'Registrar etapa');
    const next = await get('cases/' + id);
    if (['2', '9', '14', '15a', '21', '25'].includes(expected))
      console.log('Etapa municipal conferida:', expected, '→', next.workflow_step);
    await page
      .locator('.workflow-number')
      .filter({ hasText: next.workflow.current.number || next.workflow_step })
      .waitFor();
    return next;
  }
  async function panel(role) {
    await as(role);
    await page.goto(base + '/painel');
    await page
      .getByRole('heading', {
        name:
          'Painel · ' +
          {
            applicant: 'Requerente',
            protocol: 'Departamento administrativo',
            analyst: 'Departamento técnico',
          }[role],
        exact: true,
      })
      .waitFor();
    await page
      .getByRole('link', { name: 'SISLAM Brasil · painel', exact: true })
      .locator('img')
      .evaluate((img) => {
        if (!img.complete || !img.naturalWidth) throw Error('Logo indisponível');
      });
    const chooser = page.locator('.sidebar').getByLabel('Escolher município', { exact: true });
    await chooser.click();
    assert.equal(await page.locator('.sidebar .municipality-options button').count(), 1);
    await button('Itaberaba / BA Selecionado', page.locator('.sidebar')).click();
    const screenshot = 'test-results/painel-' + role + '.png';
    await page.screenshot({ path: screenshot, fullPage: true });
    report.screenshots.push(screenshot);
    await page.goto(base + '/processos/' + id);
  }
  async function uploadChecklist() {
    await page.getByRole('tab', { name: /^Documentos/ }).click();
    for (const item of (await get('cases/' + id)).checklist) {
      const card = page
        .locator('.document-item')
        .filter({ has: page.getByRole('heading', { name: item.name, exact: true }) });
      await postAction('documents/cases/' + id, () =>
        card
          .locator('input[type=file]')
          .setInputFiles({
            name: item.key + '-' + suffix + '.pdf',
            mimeType: 'application/pdf',
            buffer: pdf,
          }),
      );
    }
  }
  async function receiveAll() {
    await as('protocol');
    await page.getByRole('tab', { name: /^Documentos/ }).click();
    const c = await get('cases/' + id);
    for (const d of c.documents.filter((d) => d.status === 'sent')) {
      const row = d.requirement_key.startsWith('extra_')
        ? page.locator('tr').filter({ hasText: d.filename })
        : page.locator('.document-item').filter({ hasText: d.filename });
      await postAction('documents/' + d.id + '/receive', () =>
        button('Registrar recebimento', row).click(),
      );
      await page.waitForTimeout(100);
    }
  }
  async function reviewAll() {
    await as('analyst');
    await page.getByRole('tab', { name: /^Documentos/ }).click();
    const c = await get('cases/' + id);
    for (const item of c.checklist.filter((i) => i.document?.status === 'received')) {
      const card = page
        .locator('.document-item')
        .filter({ has: page.getByRole('heading', { name: item.name, exact: true }) });
      await button('Analisar documento', card).click();
      await dialog.getByLabel('Resultado', { exact: true }).selectOption('accepted');
      await dialog
        .getByLabel('Justificativa técnica', { exact: true })
        .fill('Peça fictícia recebida pelo administrativo e conferida pelo departamento técnico.');
      await saveModal('documents/' + item.document.id + '/review', 'Registrar análise técnica');
    }
  }
  await panel('applicant');
  await stage('1');
  await stage('2');
  const snapshot = JSON.stringify((await get('cases/' + id)).rule_snapshot);
  await panel('protocol');
  await panel('analyst');
  await stage('3');
  await stage('4', 'municipal', {
    reference: 'Referência fictícia de demonstração, sem competência homologada',
  });
  await stage('5');
  if (manual) {
    await button('Revisar enquadramento').click();
    await dialog.getByLabel('Porte ambiental', { exact: true }).fill('Porte conferido manualmente');
    await dialog.getByLabel('Potencial poluidor', { exact: true }).selectOption('baixo');
    await dialog.getByLabel('Modalidade de licenciamento', { exact: true }).fill('Procedimento informado para o teste');
    await dialog.getByLabel('Referência usada na revisão', { exact: true }).fill('Referência inserida pela pessoa para testar a revisão, sem validade normativa.');
    await dialog.getByLabel('Justificativa técnica (a proposta anterior será preservada)', { exact: true }).fill('Conferência manual dos dados e definição do checklist para o teste isolado do sistema.');
    await dialog.getByLabel('Chave do documento 1', { exact: true }).fill('documento');
    await dialog.getByLabel('Nome do documento 1', { exact: true }).fill('Documento escolhido durante a análise');
    await dialog.getByLabel('Exigência do documento 1', { exact: true }).selectOption('required');
    await saveModal('cases/' + id + '/classification', 'Registrar revisão técnica');
  }
  await button('Minuta de exigência').click();
  const noticeTitle = 'Complementação fictícia ' + suffix;
  await dialog.getByLabel('Assunto', { exact: true }).fill(noticeTitle);
  await dialog.getByLabel('Texto da minuta', { exact: true }).fill('Minuta preenchida manualmente para conferir o envio pelo departamento administrativo no teste isolado.');
  await dialog.getByLabel('Prazo demonstrativo (dias)', { exact: true }).fill('5');
  await dialog.getByLabel('Forma de contagem', { exact: true }).selectOption('business');
  await dialog
    .getByLabel('Fundamento do prazo / parâmetro demonstrativo', { exact: true })
    .fill('Parâmetro fictício de teste; não representa prazo legal validado.');
  const notice = await saveModal('cases/' + id + '/notices', 'Salvar minuta de notificação');
  await stage('6');
  await stage('7');
  await as('applicant');
  assert.equal(
    (await get('notices')).some((n) => n.id === notice.id),
    false,
  );
  await uploadChecklist();
  await stage('8');
  await receiveAll();
  await stage('9');
  await reviewAll();
  await stage('10', 'adequate');
  await stage('11');
  await stage('12', 'complete', { reference: 'Taxa fictícia sem boleto bancário', amount: 10 });
  await stage('13', 'complete', { file: 'extra_pagamento' });
  await receiveAll();
  await stage('14');
  await stage('15a', 'inadequate');
  await stage('15_admin');
  await stage('15b', 'complete', { file: 'extra_estudo' });
  await receiveAll();
  await stage('15_receipt');
  await stage('15a', 'adequate');
  await stage('16');
  await stage('17');
  await button('Registrar parecer técnico').click();
  await page.getByLabel('Conclusão', { exact: true }).selectOption('favorable_reservations');
  await page
    .getByLabel('Fundamentação e análise', { exact: true })
    .fill(
      'Parecer fictício favorável com ressalvas e condicionantes, exclusivamente para demonstrar a sequência do fluxograma.',
    );
  await page
    .getByLabel('Revisei o conteúdo e assumo a responsabilidade técnica desta versão', {
      exact: true,
    })
    .check();
  await postAction('cases/' + id + '/opinion', () => button('Registrar versão do parecer').click());
  await page.getByText('Parecer · versão 1', { exact: true }).waitFor();
  await stage('18', 'favorable');
  await stage('20');
  await as('protocol');
  await button('Registrar licença-modelo').click();
  await page.getByLabel('Validade demonstrativa', { exact: true }).fill('2029-01-01');
  await page.getByLabel('Texto da licença-modelo', { exact: true }).fill('Texto de licença-modelo preenchido manualmente durante a conferência isolada, sem validade jurídica.');
  await page
    .getByLabel('Confirmo a decisão demonstrativa. Este modelo não é um ato oficial.', {
      exact: true,
    })
    .check();
  await postAction('cases/' + id + '/license', () => button('Aprovar licença-modelo').click());
  await page.getByRole('link', { name: 'Baixar PDF-modelo', exact: true }).waitFor();
  await stage('21');
  await stage('22');
  await stage('22_admin');
  await stage('23', 'complete', { file: 'extra_relatorio' });
  await receiveAll();
  await stage('23_receipt');
  await stage('24');
  await stage('25');
  assert.equal((await get('cases/' + id)).workflow_step, 'renewal_ready');
  assert.equal(JSON.stringify((await get('cases/' + id)).rule_snapshot), snapshot);
  report.checks.push(
    'three_profile_panels_logo_itaberaba_picker_and_25_step_workflow_with_study_return',
  );
  console.log('OK: three profile panels and complete numbered municipal workflow');
  return { snapshot, notice, noticeTitle };
};
