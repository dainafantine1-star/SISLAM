const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

module.exports = async function extended({
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
}) {
  const suffix = Date.now().toString(36);
  const dialog = page.getByRole('dialog');
  const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
  const field = (name) => dialog.getByLabel(name, { exact: true });
  const check = (name) => {
    report.checks.push(name);
    console.log('OK:', name);
  };
  const close = () => button('Fechar janela', dialog).click();
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  async function transition(id, name) {
    await page.getByRole('tab', { name: 'Visão geral', exact: true }).click();
    await button(name).click();
    await field('Motivo da movimentação').fill(
      'Movimentação fictícia conferida pela suíte ampliada de navegador.',
    );
    await saveModal(`cases/${id}/transition`, 'Registrar movimentação');
  }
  async function noticeAction(id, row, name) {
    await button(name, row).click();
    await dialog.getByRole('checkbox').check();
    await saveModal(`notices/${id}/action`, 'Confirmar operação');
  }

  await login('requerente');
  await page.goto(base + '/empreendimentos');
  await button('Nova organização').click();
  await field('Razão social / nome').fill('Organização fictícia de teste ' + suffix);
  await field('CNPJ ou identificador da organização').fill('TEST-' + suffix);
  await field('Responsável legal').fill('Responsável fictício de teste');
  const organization = await saveModal('registry/organizations', 'Salvar cadastro');
  await button('Novo empreendimento').click();
  await field('Organização').selectOption(organization.id);
  const establishmentName = 'Empreendimento fictício de teste ' + suffix;
  await field('Nome do empreendimento').fill(establishmentName);
  await field('Atividade / código de enquadramento').fill('DEMO-MADEIRA');
  await field('Endereço e localização').fill('Rua fictícia de verificação, número 100');
  await field('Capacidade instalada').fill('50');
  await field('Unidade da capacidade instalada').fill((await get('rules')).find(r => r.activity === 'DEMO-MADEIRA').definition.unit);
  await field('Área do empreendimento (m²)').fill('100');
  await field('Latitude (opcional)').fill('-12.5');
  await field('Longitude (opcional)').fill('-40.3');
  const establishment = await saveModal('registry/establishments', 'Salvar cadastro');
  await page.getByPlaceholder('Pesquisar empreendimento ou organização').fill(suffix);
  await page.getByRole('cell', { name: new RegExp(establishmentName) }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.reload();
  assert((await get('registry')).establishments.some((e) => e.id === establishment.id));
  check('organization_establishment_creation_search_and_persistence');

  await page.goto(base + '/processos?novo=1');
  await field('Empreendimento').selectOption(establishment.id);
  await field('Objeto do requerimento').fill('Requerimento fictício ampliado ' + suffix);
  await button('Criar requerimento', dialog).click();
  await page.waitForURL(/\/processos\/[a-f0-9-]{36}$/);
  const id = page.url().split('/').at(-1);
  const { snapshot, notice, noticeTitle } = await require('./browser-municipal.cjs')({
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
  });

  await login('protocolo');
  await page.goto(base + '/notificacoes');
  const noticeRow = page.getByRole('row').filter({ hasText: noticeTitle });
  await button('Ver minuta', noticeRow).click();
  await dialog.getByText(noticeTitle, { exact: false }).count();
  await close();
  await noticeAction(notice.id, noticeRow, 'Aprovar');
  await noticeAction(notice.id, noticeRow, 'Simular expedição');
  assert.equal((await get('notices')).find((n) => n.id === notice.id).due_date, null);
  await button('Registrar ciência', noticeRow).click();
  await page.waitForTimeout(1100);
  const acknowledgedAt = await page.evaluate(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  });
  await field('Data e hora da ciência demonstrativa').fill(acknowledgedAt);
  await field('Evidência da ciência / referência do comprovante').fill(
    'Comprovante inteiramente fictício de recebimento para a suíte de verificação.',
  );
  await dialog.getByRole('checkbox').check();
  await saveModal(`notices/${notice.id}/action`, 'Confirmar operação');
  assert((await get('notices')).find((n) => n.id === notice.id).due_date);
  await noticeAction(notice.id, noticeRow, 'Concluir resposta');
  assert.equal((await get('notices')).find((n) => n.id === notice.id).status, 'answered');
  check('notice_approval_dispatch_acknowledgment_deadline_and_answer');

  await login('fiscal');
  await page.goto(base + '/fiscalizacao');
  await button('Agendar vistoria').click();
  const inspectionTitle = 'Vistoria fictícia ampliada ' + suffix;
  await field('Objeto da vistoria').fill(inspectionTitle);
  await field('Processo').selectOption(id);
  await field('Data e hora agendada').fill(future);
  const inspection = await saveModal('inspections', 'Agendar');
  await button(
    'Registrar relatório',
    page.getByRole('row').filter({ hasText: inspectionTitle }),
  ).click();
  await field('Relatório e constatações').fill(
    'Relatório inteiramente fictício de vistoria para comprovar agendamento, conclusão e persistência no dossiê.',
  );
  await saveModal(`inspections/${inspection.id}/report`, 'Concluir vistoria');
  assert.equal((await get('inspections')).find((i) => i.id === inspection.id).status, 'completed');
  check('inspection_scheduling_report_and_completion');

  await login('ouvidoria');
  await page.goto(base + '/denuncias');
  await button('Registrar denúncia').click();
  const complaintTitle = 'Denúncia fictícia ampliada ' + suffix;
  await field('Assunto').fill(complaintTitle);
  await field('Localização do fato').fill('Local fictício para teste de apuração');
  await field('Descrição do fato (sem dados pessoais do denunciante)').fill(
    'Relato inteiramente fictício para verificar cada etapa de apuração e o arquivamento expresso.',
  );
  await field('Contato do denunciante (opcional, protegido)').fill('contato-ficticio@example.test');
  const complaint = await saveModal('complaints', 'Registrar denúncia');
  for (const to of ['screening', 'diligence', 'investigation', 'concluded', 'archived']) {
    await button('Detalhes', page.getByRole('row').filter({ hasText: complaintTitle })).click();
    await field('Próxima etapa').selectOption(to);
    await field('Apuração, motivo e fundamentação do encaminhamento').fill(
      'Apuração inteiramente fictícia, com evidências simuladas para verificar a transição expressa de etapa.',
    );
    await saveModal(`complaints/${complaint.id}/transition`, 'Registrar encaminhamento');
    assert.equal((await get('complaints')).find((c) => c.id === complaint.id).status, to);
    const stageLabel = {
      screening: 'Triagem',
      diligence: 'Diligência',
      investigation: 'Em apuração',
      concluded: 'Concluída',
      archived: 'Arquivada',
    }[to];
    await page
      .getByRole('row')
      .filter({ hasText: complaintTitle })
      .getByText(stageLabel, { exact: true })
      .waitFor();
  }
  await button('Detalhes', page.getByRole('row').filter({ hasText: complaintTitle })).click();
  assert.equal(await button('Registrar encaminhamento', dialog).count(), 0);
  await close();
  check('complaint_registration_all_stages_conclusion_and_archive');

  await login('admin');
  await page.goto(base + '/regras');
  await button('Consultar').first().click();
  await close();
  await button('Nova versão de regra').click();
  await field('Código de atividade').fill('DEMO-TEST-' + suffix);
  await field('Título da revisão').fill('Regra fictícia de verificação ' + suffix);
  await field('Vigência inicial').fill('2026-01-01');
  await field('Referência / origem da revisão').fill('Origem fictícia, sem validade normativa');
  await field('Unidade de medida da capacidade').fill('unidades de teste');
  await field('Limite superior da faixa 1').fill('100');
  await field('Porte da faixa 1').fill('Porte informado no teste');
  await field('Potencial poluidor da faixa 1').selectOption('baixo');
  await field('Modalidade da faixa 1').fill('Modalidade informada no teste');
  await field('Chave do documento 1').fill('arquivo');
  await field('Nome do documento 1').fill('Documento informado no teste');
  await field('Exigência do documento 1').selectOption('required');
  const rule = await saveModal('rules', 'Salvar nova versão');
  assert.equal(rule.status, 'draft');
  assert.equal(JSON.stringify((await get('cases/' + id)).rule_snapshot), snapshot);
  check('rule_details_new_draft_version_and_frozen_protocol_preserved');

  await page.goto(base + '/administracao');
  await button('Adicionar pessoa').click();
  const personName = 'Pessoa fictícia de teste ' + suffix;
  await field('Nome completo').fill(personName);
  await field('E-mail').fill('teste-' + suffix + '@example.test');
  await field('Senha inicial (mínimo 12 caracteres)').fill('Ficticia-Somente-Teste-2026!');
  const person = await saveModal('admin/team');
  await button('Alterar acesso', page.getByRole('row').filter({ hasText: personName })).click();
  await field('Estado').selectOption('false');
  await field('Motivo da alteração').fill(
    'Desativação fictícia para verificar a gestão de acesso.',
  );
  await saveModal('admin/team/' + person.id);
  assert.equal((await get('admin/team')).find((p) => p.id === person.id).active, false);
  await page.getByRole('tab', { name: 'Calendário', exact: true }).click();
  await button('Cadastrar feriado').click();
  await field('Data').fill('2027-06-15');
  await field('Descrição do feriado').fill('Data fictícia de teste ' + suffix);
  await saveModal('admin/holidays');
  await page.getByText('Data fictícia de teste ' + suffix, { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Integrações', exact: true }).click();
  await page.getByRole('heading', { name: 'Situação das integrações', exact: true }).waitFor();
  check('team_creation_access_deactivation_calendar_and_integration_status');

  await page.getByRole('tab', { name: 'Acesso de suporte', exact: true }).click();
  await button('Autorizar acesso temporário').click();
  await field('Fornecedor').selectOption({ label: 'Suporte SISLAM · fornecedor@demo.sislam.test' });
  await field('Duração em minutos (5 a 60)').fill('5');
  const supportReason = 'Atendimento fictício de verificação ' + suffix;
  await field('Motivo do atendimento').fill(supportReason);
  await dialog.getByRole('checkbox').check();
  const grant = await saveModal('admin/support-grants');
  await login('fornecedor');
  const supplierCases = await get('cases');
  assert(supplierCases.some((c) => c.id === id));
  await page.goto(base + '/processos/' + id);
  assert.equal(await button('Atribuir técnico').count(), 0);
  assert.equal(await button('Revisar enquadramento').count(), 0);
  await login('admin');
  await page.goto(base + '/administracao');
  await page.getByRole('tab', { name: 'Acesso de suporte', exact: true }).click();
  await button('Revogar', page.getByRole('row').filter({ hasText: supportReason })).click();
  await saveModal(`admin/support-grants/${grant.id}/revoke`);
  assert((await get('admin/support-grants')).find((g) => g.id === grant.id).revoked_at);
  check('temporary_read_only_supplier_support_and_revocation');

  await page.goto(base + '/conta');
  const session = await get('auth/me');
  const home = session.user.municipalityId;
  const other = session.memberships.find((m) => m.id !== home).id;
  await page.getByLabel('Município ativo', { exact: true }).selectOption(other);
  await button('Trocar município').click();
  await page.waitForURL('**/painel');
  assert.equal((await get('auth/me')).user.municipalityId, other);
  assert.equal(
    (await get('registry')).establishments.some((e) => e.id === establishment.id),
    false,
  );
  await page.goto(base + '/conta');
  await page.getByLabel('Município ativo', { exact: true }).selectOption(home);
  await button('Trocar município').click();
  await page.waitForURL('**/painel');
  check('municipality_switch_through_account_and_data_isolation');

  await login('requerente');
  await page.goto(base + '/processos/' + caseId);
  await button('Iniciar renovação').click();
  await page.waitForURL(/\/processos\/[a-f0-9-]{36}$/);
  await page.waitForURL((url) => url.pathname !== '/processos/' + caseId);
  const renewalData = await get('cases/' + page.url().split('/').at(-1));
  assert.equal(renewalData.parent_id, caseId);
  assert.equal(renewalData.request_type, 'renewal');
  check('renewal_created_from_license_with_link_to_original_process');

  await login('autoridade');
  await page.goto(base + '/processos/' + caseId);
  await transition(caseId, 'Encerrar processo');
  assert.equal((await get('cases/' + caseId)).status, 'closed');
  await page.goto(base + '/arquivo');
  const closedProcess = await get('cases/' + caseId);
  await page
    .getByPlaceholder('Pesquisar protocolo, título ou empreendimento')
    .fill(closedProcess.protocol);
  await page.getByRole('link', { name: 'Ver processo', exact: true }).waitFor();
  check('licensed_process_closure_and_digital_archive');

  await login('requerente');

  await page.goto(base + '/processos');
  await page
    .getByPlaceholder('Pesquisar protocolo, título ou empreendimento')
    .fill((await get('cases/' + id)).protocol);
  await page.locator('tbody tr').first().waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.locator('.inline-filter select').first().selectOption('draft');
  await page.getByText('Nenhum processo nesta visualização', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['empreendimentos', 'processos', 'documentos', 'condicionantes', 'conta']) {
    await page.goto(base + '/' + route);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByRole('status').filter({ hasText: 'Carregando' }).waitFor({ state: 'hidden' });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      route + ' apresenta rolagem horizontal',
    );
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  check('process_search_status_filter_and_mobile_applicant_pages');

  await page.goto(base + '/conta');
  await page.getByLabel('Senha atual', { exact: true }).fill(password);
  const newPassword = password + 'Changed';
  await page.getByLabel('Nova senha', { exact: true }).fill(newPassword);
  await page.getByLabel('Repita a nova senha', { exact: true }).fill(newPassword + '-different');
  await button('Alterar senha e entrar novamente').click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'As novas senhas precisam ser iguais' })
    .waitFor();
  await page.getByLabel('Repita a nova senha', { exact: true }).fill(newPassword);
  await button('Alterar senha e entrar novamente').click();
  await page.waitForURL('**/login');
  await page.getByLabel('Perfil da demonstração').selectOption('requerente@demo.sislam.test');
  await page.getByLabel('Senha', { exact: true }).fill(newPassword);
  await button('Entrar no sistema').click();
  await page.waitForURL('**/painel');
  await page.goto(base + '/conta');
  await page.getByLabel('Confirme a senha atual', { exact: true }).fill(newPassword);
  const mfa = await postAction('auth/mfa/setup', () => button('Configurar autenticador').click());
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...mfa.secret]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac.at(-1) & 15;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
  await page.getByLabel('Código de seis dígitos', { exact: true }).fill(code);
  await postAction('auth/mfa/verify', () => button('Confirmar MFA').click());
  await page.getByText('MFA confirmado nesta sessão.', { exact: true }).waitFor();
  await button('Sair do sistema').click();
  await page.waitForURL('**/login');
  await page.goto(base + '/processos');
  await page.waitForURL('**/login');
  check('password_confirmation_change_relogin_mfa_setup_and_logout');
};
