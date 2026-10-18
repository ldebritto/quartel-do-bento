/**
 * Quartel do Bento — backend das confirmações de presença.
 *
 * Script "vinculado" a uma planilha do Google: recebe o POST da página,
 * valida os dados e grava (ou atualiza) uma linha na aba "Respostas".
 * A aba "Resumo" calcula os totais sozinha.
 *
 * Como usar: veja o README.md do repositório.
 */

const ABA_RESPOSTAS = 'Respostas';
const ABA_RESUMO = 'Resumo';
const FUSO = 'America/Sao_Paulo';
const MAX_POR_CATEGORIA = 15;

const CABECALHO = [
  'Atualizado em', 'Nome', 'Vai?', 'Adultos',
  'Crianças 6–12', 'Crianças 0–5', 'Total', 'Mensagem', 'chave'
];
const COL = { DATA: 1, NOME: 2, VAI: 3, ADULTOS: 4, C612: 5, C05: 6, TOTAL: 7, MSG: 8, CHAVE: 9 };

/** Rode UMA vez, manualmente, para montar as abas e autorizar o script. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(FUSO);

  // --- Respostas ---
  let r = ss.getSheetByName(ABA_RESPOSTAS) || ss.insertSheet(ABA_RESPOSTAS);
  r.clear();
  r.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO])
    .setFontWeight('bold').setBackground('#c8151b').setFontColor('#ffffff');
  r.setFrozenRows(1);
  r.setFrozenColumns(2);
  r.setColumnWidths(1, 1, 130);
  r.setColumnWidths(2, 1, 180);
  r.setColumnWidths(3, 5, 90);
  r.setColumnWidth(COL.MSG, 320);
  r.hideColumns(COL.CHAVE);
  // Cores por resposta
  const faixa = r.getRange(2, COL.NOME, 1000, 2);
  r.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$C2="Sim"').setBackground('#e3f4e8').setRanges([faixa]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$C2="Não"').setBackground('#fbe3e3').setRanges([faixa]).build()
  ]);

  // --- Resumo ---
  let s = ss.getSheetByName(ABA_RESUMO) || ss.insertSheet(ABA_RESUMO, 0);
  s.clear();
  const linhas = [
    ['Quartel do Bento · 07/11 às 15h', ''],
    ['Respostas "Sim"', '=COUNTIF(Respostas!C2:C,"Sim")'],
    ['Respostas "Não"', '=COUNTIF(Respostas!C2:C,"Não")'],
    ['Adultos', '=SUMIF(Respostas!C2:C,"Sim",Respostas!D2:D)'],
    ['Crianças 6–12', '=SUMIF(Respostas!C2:C,"Sim",Respostas!E2:E)'],
    ['Crianças 0–5', '=SUMIF(Respostas!C2:C,"Sim",Respostas!F2:F)'],
    ['TOTAL DE PESSOAS', '=SUM(B4:B6)']
  ];
  s.getRange(1, 1, linhas.length, 2).setValues(linhas);
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
    const agora = Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm');
    const linha = [agora, protegido_(nome), vai, adultos, c612, c05, adultos + c612 + c05, protegido_(mensagem), chave];

    // Mesma pessoa respondendo de novo? Atualiza a linha existente.
    const ultima = aba.getLastRow();
    let alvo = 0;
    if (ultima >= 2) {
      const chaves = aba.getRange(2, COL.CHAVE, ultima - 1, 1).getValues();
      for (let i = 0; i < chaves.length; i++) {
        if (chaves[i][0] === chave) { alvo = i + 2; break; }
      }
    }
    const atualizou = alvo > 0;
    if (!atualizou) alvo = ultima + 1;
    aba.getRange(alvo, 1, 1, linha.length).setValues([linha]);

    return json_({ ok: true, atualizou: atualizou });
  } catch (err) {
    return json_({ ok: false, erro: 'Erro interno' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
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
