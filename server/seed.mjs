function minutesAgoIso(now, mins) {
  return new Date(now.getTime() - mins * 60_000).toISOString();
}

export function seedInitialData(db, { force = false } = {}) {
  const existingCount = db.prepare('SELECT COUNT(*) AS count FROM work_orders').get().count;
  if (!force && existingCount > 0) {
    return false;
  }

  db.exec('BEGIN');
  try {
    if (force) {
      db.exec('DELETE FROM alerts; DELETE FROM notices; DELETE FROM units; DELETE FROM work_orders; DELETE FROM operators; DELETE FROM settings;');
      try {
        db.exec("DELETE FROM sqlite_sequence WHERE name IN ('work_orders', 'alerts', 'notices', 'units');");
      } catch {
        // sqlite_sequence pode não existir ainda se nunca houve autoincrement
      }
    }

    const insertOperator = db.prepare(`
      INSERT OR REPLACE INTO operators (id, name, badge, station, shift, shift_goal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const operators = [
      ['op-carlos', 'Carlos Ramos', 'ID #8821', 'Estação CNC-04', 'TURNO B • POSTO ATIVO', 6],
      ['op-marcos', 'Marcos Silva', 'ID #7742', 'Linha de Montagem / Manutenção Mecânica Setor-03', 'TURNO B • POSTO ATIVO', 6],
      ['op-ana', 'Ana Paula Costa', 'ID #9104', 'Central Elétrica / Painéis P-02', 'TURNO B • POSTO ATIVO', 6]
    ];
    for (const op of operators) {
      insertOperator.run(...op);
    }

    const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('plantName', 'Planta Sul • Pavilhão 3');
    insertSetting.run('shiftLabel', 'Tempo de Ciclo Turno 02 • Atualização: 1 seg');
    insertSetting.run('dailyGoal', '40');
    insertSetting.run('totalBenches', '8');

    const now = new Date();

    const insertOrder = db.prepare(`
      INSERT INTO work_orders (
        code, unit, sector, title, description, urgent, status,
        created_at, started_at, paused_at, pause_reason, completed_at,
        elapsed_seconds, created_by, assigned_operator_id, assigned_operator_name,
        assigned_station, operator_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const orders = [
      // NA FILA (queued)
      [
        '#1039',
        'Unidade Usinagem - Linha C',
        'Linha C • Prensa Hidráulica',
        'Vazamento Válvula de Pressão 04',
        'Perda de carga hidráulica acusando desarme automático na prensa.',
        1,
        'queued',
        minutesAgoIso(now, 24),
        null, null, null, null,
        0,
        'Sup. Roberto Lima',
        null, null, null,
        ''
      ],
      [
        '#1040',
        'Unidade Logística - Setor de Saída',
        'Setor de Saída • Empacotamento',
        'Substituição Correia Transportadora',
        'Desgaste prematuro com ruído metálico intenso no empacotamento central.',
        1,
        'queued',
        minutesAgoIso(now, 18),
        null, null, null, null,
        0,
        'Sup. Roberto Lima',
        null, null, null,
        ''
      ],
      [
        '#1042',
        'Caldeira Industrial - Setor B',
        'Utilidades • Vapor',
        'Manutenção Caldeira Industrial Setor B',
        'Oscilação de pressão na linha secundária de vapor; inspeção preventiva da válvula reguladora.',
        1,
        'queued',
        minutesAgoIso(now, 2),
        null, null, null, null,
        0,
        'Sup. Valéria Nunes',
        null, null, null,
        ''
      ],
      [
        '#1041',
        'Unidade Robótica - Célula 01',
        'Célula 01 • Robô RB-02',
        'Calibração Sensor Óptico Braço Kuka',
        'Ajuste rotineiro quinzenal de precisão no robô RB-02 e validação de alinhamento.',
        0,
        'queued',
        minutesAgoIso(now, 14),
        null, null, null, null,
        0,
        'Eng. Felipe Moura',
        null, null, null,
        ''
      ],
      [
        '#1044',
        'Usinagem • CNC Haas 01',
        'Setor Usinagem Pesada',
        'Lubrificação de Guias - Torno CNC Haas 01',
        'Lubrificação de guias lineares e verificação de nível do reservatório de fluido refrigerante.',
        0,
        'queued',
        minutesAgoIso(now, 9),
        null, null, null, null,
        0,
        'Carlos Ramos',
        null, null, null,
        ''
      ],

      // EM ATENDIMENTO (in_progress)
      [
        '#1038',
        'Célula 04-A • Setor de Injeção B',
        'Setor de Injeção B',
        'Manutenção Preventiva Injetora Hidráulica 04',
        'Troca de anel de vedação do êmbolo secundário, teste de estanqueidade a 160 BAR e calibração de rotina do pressostato.',
        1,
        'in_progress',
        minutesAgoIso(now, 110),
        minutesAgoIso(now, 84),
        null, null, null,
        0,
        'Sup. Valéria Nunes',
        'op-marcos',
        'Marcos Silva',
        'Linha de Montagem / Manutenção Mecânica Setor-03',
        'Vedação substituída e teste de pressão validado com sucesso.'
      ],

      // FINALIZADAS HOJE (completed)
      [
        '#1034',
        'Unidade Tintas - Misturador B',
        'Misturador B',
        'Substituição Inversor de Frequência',
        'Parametrização concluída e rampa de aceleração validada em carga nominal.',
        0,
        'completed',
        minutesAgoIso(now, 185),
        minutesAgoIso(now, 170),
        null, null,
        minutesAgoIso(now, 128),
        42 * 60,
        'Ana Paula Costa',
        'op-ana',
        'Ana Paula Costa',
        'Central Elétrica / Painéis P-02',
        'Inversor WEG CFW500 instalado, rampa configurada para 4.5s.'
      ],
      [
        '#1033',
        'Unidade Extrusão - Linha 01',
        'Extrusão Linha 01',
        'Reparo Painel Touch IHM Linha 01',
        'Troca de cabo LVDS rompido e reinstalação de firmware da IHM principal.',
        1,
        'completed',
        minutesAgoIso(now, 215),
        minutesAgoIso(now, 200),
        null, null,
        minutesAgoIso(now, 137),
        63 * 60,
        'Sup. Valéria Nunes',
        'op-carlos',
        'Carlos Ramos',
        'Estação CNC-04',
        'Display voltou ao normal, calibrado e backup de receitas restaurado.'
      ],
      [
        '#1032',
        'Unidade Prensas - Prensa 08',
        'Prensa 08',
        'Ajuste de Folga Engrenagem Redutor',
        'Lubrificação sintética ISO VG 320 aplicada com folga aferida dentro da tolerância.',
        0,
        'completed',
        minutesAgoIso(now, 265),
        minutesAgoIso(now, 250),
        null, null,
        minutesAgoIso(now, 205),
        45 * 60,
        'Marcos Silva',
        'op-marcos',
        'Marcos Silva',
        'Linha de Montagem / Manutenção Mecânica Setor-03',
        'Reaperto de terminais e folga axial validada em 0.08mm.'
      ],
      [
        '#1035',
        'Prensas • Célula Carga 01',
        'Prensa 01',
        'Calibração Célula de Carga Prensa 01',
        'Aferição de torque e zero eletrônico do transdutor de carga da prensa 01.',
        0,
        'completed',
        minutesAgoIso(now, 230),
        minutesAgoIso(now, 220),
        null, null,
        minutesAgoIso(now, 172),
        48 * 60,
        'Marcos Silva',
        'op-marcos',
        'Marcos Silva',
        'Linha de Montagem / Manutenção Mecânica Setor-03',
        'Curva de calibração aprovada dentro de 0.2% de erro.'
      ],
      [
        '#1036',
        'Casa de Bombas • Bomba B-03',
        'Utilidades B-03',
        'Substituição Filtro de Sucção Bomba B-03',
        'Limpeza do cesto filtrante e troca do elemento de sucção para restabelecer vazão.',
        0,
        'completed',
        minutesAgoIso(now, 160),
        minutesAgoIso(now, 150),
        null, null,
        minutesAgoIso(now, 115),
        35 * 60,
        'Marcos Silva',
        'op-marcos',
        'Marcos Silva',
        'Linha de Montagem / Manutenção Mecânica Setor-03',
        'Pressão de recalque estabilizada em 6.4 bar.'
      ]
    ];

    for (const o of orders) {
      insertOrder.run(...o);
    }

    const caldeira = db.prepare("SELECT id FROM work_orders WHERE code = '#1042'").get();
    db.prepare(`
      INSERT INTO alerts (order_id, order_code, type, message, actor, created_at, acknowledged)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      caldeira?.id ?? null,
      '#1042',
      'new_dispatch',
      'Manutenção Caldeira Industrial Setor B',
      'Sup. Valéria Nunes',
      minutesAgoIso(now, 2),
      0
    );

    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
