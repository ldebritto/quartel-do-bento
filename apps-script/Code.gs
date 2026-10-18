/**
 * Quartel do Bento — backend das confirmações de presença.
 *
 * Script "vinculado" a uma planilha do Google: recebe o POST da página,
 * valida os dados e grava (ou atualiza) uma linha na aba "Respostas".
 * A aba "Resumo" calcula os totais sozinha.
 *
 * Homônimos: cada aparelho envia um "id" aleatório. Só o MESMO id atualiza uma linha;
 * o nome nunca decide. Nomes iguais em linhas diferentes ficam marcados em "Atenção".
 *
 * Como usar: veja o README.md do repositório.
 */

const ABA_RESPOSTAS = 'Respostas';
const ABA_RESUMO = 'Resumo';
const FUSO = 'America/Sao_Paulo';
const MAX_POR_CATEGORIA = 15;

const CABECALHO = [
  'Atualizado em', 'Nome', 'Vai?', 'Adultos',
  'Crianças 6–12', 'Crianças 0–5', 'Total', 'Mensagem', 'chave', 'id', 'Atenção'
];
const COL = { DATA: 1, NOME: 2, VAI: 3, ADULTOS: 4, C612: 5, C05: 6, TOTAL: 7, MSG: 8, CHAVE: 9, ID: 10, ATENCAO: 11 };
const COR_ALERTA = '#ffd9a8';
const RE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Rode UMA vez, manualmente, para montar as abas e autorizar o script. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(FUSO);

  // --- Respostas ---
  // Não limpa a aba: rodar setup() de novo nunca apaga respostas já recebidas.
  let r = ss.getSheetByName(ABA_RESPOSTAS) || ss.insertSheet(ABA_RESPOSTAS);
  r.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO])
    .setFontWeight('bold').setBackground('#c8151b').setFontColor('#ffffff');
  r.setFrozenRows(1);
  r.setFrozenColumns(2);
  r.setColumnWidths(1, 1, 130);
  r.setColumnWidths(2, 1, 180);
  r.setColumnWidths(3, 5, 90);
  r.setColumnWidth(COL.MSG, 320);
  r.setColumnWidth(COL.ATENCAO, 190);
  r.hideColumns(COL.CHAVE, 2); // "chave" e "id" são técnicas
  // Cor por resposta, só na coluna "Vai?" (o nome fica livre para o alerta de repetição)
  const faixa = r.getRange(2, COL.VAI, Math.max(1, r.getMaxRows() - 1), 1);
  r.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$C2="Sim"').setBackground('#e3f4e8').setRanges([faixa]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$C2="Não"').setBackground('#fbe3e3').setRanges([faixa]).build()
  ]);
  atualizarAlertas_(r); // rodar setup() de novo também atualiza os alertas (útil após apagar linhas)

  // --- Resumo ---
  let s = ss.getSheetByName(ABA_RESUMO) || ss.insertSheet(ABA_RESUMO, 0);
  s.clear();
  s.getRange(1, 1, 7, 1).setValues([
    ['Quartel do Bento · 07/11 às 15h'],
    ['Respostas "Sim"'],
    ['Respostas "Não"'],
    ['Adultos'],
    ['Crianças 6–12'],
    ['Crianças 0–5'],
    ['TOTAL DE PESSOAS']
  ]);
  definirFormulasResumo_(s);
  s.getRange('A1:B1').merge().setFontWeight('bold').setFontSize(14)
    .setBackground('#c8151b').setFontColor('#ffffff');
  s.getRange('A2:B7').setFontSize(13);
  s.getRange('B2:B7').setHorizontalAlignment('center').setFontWeight('bold');
  s.getRange('A7:B7').setBackground('#f2b33d').setFontWeight('bold').setFontSize(15);
  s.setColumnWidth(1, 220);
  s.setColumnWidth(2, 110);

  SpreadsheetApp.flush();
}

/** Teste simples no navegador: abra a URL /exec e veja {"ok":true}. */
function doGet() {
  return json_({ ok: true, servico: 'quartel-do-bento' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    const dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Armadilha para robôs: o campo "hp" fica escondido na página.
    if (dados.hp) return json_({ ok: true });

    const nome = limpar_(dados.nome, 80);
    const vai = dados.vai === 'Sim' ? 'Sim' : (dados.vai === 'Não' ? 'Não' : '');
    if (nome.length < 2) return json_({ ok: false, erro: 'Nome inválido' });
    if (!vai) return json_({ ok: false, erro: 'Resposta inválida' });

    let adultos = 0, c612 = 0, c05 = 0;
    if (vai === 'Sim') {
      adultos = inteiro_(dados.adultos);
      c612 = inteiro_(dados.criancas_6_12);
      c05 = inteiro_(dados.criancas_0_5);
      if (adultos + c612 + c05 < 1) return json_({ ok: false, erro: 'Informe ao menos uma pessoa' });
    }
    const mensagem = limpar_(dados.mensagem, 500);

    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_RESPOSTAS);
    if (!aba) return json_({ ok: false, erro: 'Rode setup() antes' });

    const chave = chave_(nome);
    const id = RE_ID.test(String(dados.id || '')) ? String(dados.id) : '';
    const agora = Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm');
    const linha = [agora, protegido_(nome), vai, adultos, c612, c05, adultos + c612 + c05, protegido_(mensagem), chave, id];

    // Quem é quem: a ÚNICA forma de atualizar uma linha é reenviar o mesmo id (o aparelho de
    // quem respondeu). O nome NUNCA decide: duas pessoas com o mesmo nome viram duas linhas.
    const ultima = aba.getLastRow();
    let alvo = 0;
    if (id && ultima >= 2) {
      const ids = aba.getRange(2, COL.ID, ultima - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === id) { alvo = i + 2; break; }
      }
    }
    const atualizou = alvo > 0;
    if (!atualizou) alvo = ultima + 1;
    aba.getRange(alvo, 1, 1, linha.length).setValues([linha]);

    // Nomes iguais em linhas diferentes (homônimos ou a mesma pessoa em dois aparelhos): sinaliza.
    atualizarAlertas_(aba);

    return json_({ ok: true, atualizou: atualizou });
  } catch (err) {
    return json_({ ok: false, erro: 'Erro interno' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ---------- fórmulas do Resumo (inglês ou português) ----------

/**
 * Planilhas em português usam CONT.SE/SOMASE/SOMA e ";" nas fórmulas; em inglês,
 * COUNTIF/SUMIF/SUM e ",". Tenta a variante provável pelo idioma da planilha e,
 * se alguma célula der erro, tenta a outra.
 */
function definirFormulasResumo_(s) {
  const loc = String(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetLocale() || '');
  const ordem = /^pt/i.test(loc) ? ['pt', 'en'] : ['en', 'pt'];

  for (const variante of ordem) {
    const formulas = formulasResumo_(variante);
    let aceitas = true;
    for (let i = 0; i < formulas.length; i++) {
      try {
        s.getRange(2 + i, 2).setFormula(formulas[i]); // B2..B7
      } catch (e) { aceitas = false; break; }
    }
    if (!aceitas) continue;
    SpreadsheetApp.flush();
    const exibido = s.getRange(2, 2, formulas.length, 1).getDisplayValues().map(l => String(l[0]));
    if (!exibido.some(t => /^(#|Err)/i.test(t))) return variante;
  }
  throw new Error('Não consegui criar as fórmulas do Resumo neste idioma de planilha. ' +
                  'Use a tabela "Fórmulas manuais" do README.');
}

function formulasResumo_(variante) {
  const pt = variante === 'pt';
  const sep = pt ? ';' : ',';
  const contar = (rotulo) => pt
    ? `=CONT.SE(Respostas!C:C${sep}"${rotulo}")`
    : `=COUNTIF(Respostas!C:C${sep}"${rotulo}")`;
  const somar = (col) => pt
    ? `=SOMASE(Respostas!C:C${sep}"Sim"${sep}Respostas!${col}:${col})`
    : `=SUMIF(Respostas!C:C${sep}"Sim"${sep}Respostas!${col}:${col})`;
  return [contar('Sim'), contar('Não'), somar('D'), somar('E'), somar('F'), pt ? '=SOMA(B4:B6)' : '=SUM(B4:B6)'];
}

// ---------- alerta de nomes repetidos ----------

/**
 * Marca toda linha cujo nome (normalizado) aparece mais de uma vez: texto em "Atenção" e
 * fundo laranja no nome. Quem decide é você: homônimos ficam as duas; a mesma pessoa em
 * dois aparelhos, apague a linha mais antiga. Recalculado a cada resposta e no setup().
 */
function atualizarAlertas_(aba) {
  const ultima = aba.getLastRow();
  if (ultima < 2) return;
  const n = ultima - 1;
  const chaves = aba.getRange(2, COL.CHAVE, n, 1).getValues().map(l => String(l[0]));
  const contagem = {};
  chaves.forEach(k => { if (k) contagem[k] = (contagem[k] || 0) + 1; });
  const repetida = chaves.map(k => !!k && contagem[k] > 1);
  aba.getRange(2, COL.ATENCAO, n, 1).setValues(repetida.map(r => [r ? 'Nome repetido: conferir' : '']));
  aba.getRange(2, COL.NOME, n, 1).setBackgrounds(repetida.map(r => [r ? COR_ALERTA : null]));
}

// ---------- utilitários ----------

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function limpar_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function inteiro_(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : Math.min(MAX_POR_CATEGORIA, Math.max(0, n));
}

/** "João  da Silva" e "joao da silva" são a mesma pessoa. */
function chave_(nome) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Evita que textos começando com = + - @ sejam lidos como fórmula. */
function protegido_(txt) {
  return /^[=+\-@]/.test(txt) ? "'" + txt : txt;
}
