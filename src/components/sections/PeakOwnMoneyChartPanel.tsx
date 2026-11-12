'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  PortfolioProcurementWavesSummary,
  ScenarioInvestmentSummary,
} from '@/lib/unifiedBusinessEngine';

const MONTHS_FULL_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const MONTHS_FULL_ABLATIVE = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
];

const MONTHS_FULL_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function fmtMlnRub(valRub: number, digits = 2): string {
  const abs = Math.abs(valRub);
  if (abs === 0) return '0 млн ₽';
  if (abs < 100_000) {
    return `${(abs / 1_000).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} тыс. ₽`;
  }
  return `${(abs / 1_000_000).toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} млн ₽`;
}

function fmtSignedMlnRub(valRub: number, digits = 1): string {
  if (Math.abs(valRub) < 5_000) return '0,0 млн ₽';
  const sign = valRub > 0 ? '+' : '−';
  return `${sign}${(Math.abs(valRub) / 1_000_000).toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} млн ₽`;
}

function fmtExactRub(valRub: number): string {
  return `${Math.round(valRub).toLocaleString('ru-RU')} ₽`;
}

export interface PeakOwnMoneyChartPanelProps {
  id?: string;
  investmentSummary: ScenarioInvestmentSummary;
  wavesSummary?: PortfolioProcurementWavesSummary;
  scenarioTitle: string;
  year?: number;
  initialCashMln?: number;
  onChangeInitialCashMln?: (nextMln: number) => void;
  wbLagMonths?: number;
  onChangeWbLagMonths?: (nextLag: number) => void;
  wbScheduleSpecified?: boolean;
  onToggleWbScheduleSpecified?: () => void;
  compact?: boolean;
}

export function PeakOwnMoneyChartPanel({
  id,
  investmentSummary,
  wavesSummary,
  scenarioTitle,
  year = 2027,
  initialCashMln = 0,
  onChangeInitialCashMln,
  wbLagMonths = 0,
  onChangeWbLagMonths,
  wbScheduleSpecified = true,
  onToggleWbScheduleSpecified,
  compact = false,
}: PeakOwnMoneyChartPanelProps) {
  const rows = investmentSummary.monthlyRows || [];
  const peakIdx = Math.min(11, Math.max(0, investmentSummary.peakMonthIdx ?? 0));

  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(peakIdx);
  const [chartLayerMode, setChartLayerMode] = useState<'all' | 'curves' | 'bars'>('all');
  const [tableExpanded, setTableExpanded] = useState<boolean>(!compact);

  useEffect(() => {
    setSelectedMonthIdx(peakIdx);
  }, [peakIdx, scenarioTitle]);

  const peakRow = rows[peakIdx] || rows[0];
  const selectedRow = rows[selectedMonthIdx] || peakRow;
  const selectedScheduleRow = wavesSummary?.monthlySchedule?.[selectedMonthIdx];

  const ownMoneyPeakRub =
    investmentSummary.verifiedOwnMoneyRequiredRub !== null &&
    investmentSummary.verifiedOwnMoneyRequiredRub !== undefined
      ? investmentSummary.verifiedOwnMoneyRequiredRub
      : investmentSummary.netOwnMoneyRequiredRub;

  const grossPeakDeficitRub = investmentSummary.peakWorkingCapitalRub || 0;
  const initialCashRub = investmentSummary.initialCashOnHandRub || 0;

  const openingAtPeak =
    investmentSummary.openingBalanceAtPeakMonthRub ?? (peakRow?.openingCashBalanceRub || 0);
  const prepayAtPeak =
    investmentSummary.prepayInPeakMonthRub ?? (peakRow?.factoryPrepaymentOutflowRub || 0);
  const balanceAtPeak =
    investmentSummary.balancePayInPeakMonthRub ?? (peakRow?.factoryBalanceOutflowRub || 0);
  const wbAtPeak =
    investmentSummary.wbInflowInPeakMonthRub ?? (peakRow?.wbNetInflowRub || 0);
  const endAtPeak =
    investmentSummary.endOfPeakMonthBalanceRub ?? (peakRow?.cumulativeCashBalanceRub || 0);

  const isIntraMonthPeak =
    investmentSummary.peakPhase
      ? investmentSummary.peakPhase === 'before_wb_inflow'
      : Boolean(peakRow?.isIntraMonthPeak);

  const peakMonthNominative = MONTHS_FULL_NOMINATIVE[peakIdx] || investmentSummary.peakMonthLabel;
  const peakMonthAblative = MONTHS_FULL_ABLATIVE[peakIdx] || investmentSummary.peakMonthLabel;
  const selfFundingIdx = investmentSummary.selfFundingMonthIdx;
  const selfFundingGenitive =
    selfFundingIdx !== null && selfFundingIdx !== undefined
      ? MONTHS_FULL_GENITIVE[selfFundingIdx] || investmentSummary.selfFundingMonthLabel
      : null;

  const monthsInDeficit =
    investmentSummary.monthsInDeficitCount ??
    rows.filter((r) => Math.min(r.intraMonthLowBalanceRub, r.cumulativeCashBalanceRub) < 0).length;

  const totalProcRub = investmentSummary.totalProcurementBudgetRub || 0;
  const wbFundedSharePct =
    totalProcRub > 0
      ? Math.min(
          100,
          Math.max(0, Math.round(((totalProcRub - grossPeakDeficitRub) / totalProcRub) * 100))
        )
      : 0;

  const cashRoiMultiple =
    ownMoneyPeakRub > 0
      ? investmentSummary.annualEstimatedOperatingProfitRub / ownMoneyPeakRub
      : null;

  // Геометрия двухслойного SVG-графика (12 месяцев)
  const chartGeom = useMemo(() => {
    const W = 1080;
    const H = 376;
    const padL = 78;
    const padR = 28;
    const padT = 36;
    const padB = 54;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    let maxPos = 10_000_000;
    let maxNeg = 10_000_000;

    for (const r of rows) {
      const posCandidate = Math.max(
        0,
        r.wbNetInflowRub,
        r.cumulativeCashBalanceRub + initialCashRub,
        r.intraMonthLowBalanceRub + initialCashRub
      );
      const negCandidate = Math.max(
        0,
        r.factoryTotalOutflowRub,
        -(r.intraMonthLowBalanceRub + initialCashRub),
        -(r.cumulativeCashBalanceRub + initialCashRub)
      );
      if (posCandidate > maxPos) maxPos = posCandidate;
      if (negCandidate > maxNeg) maxNeg = negCandidate;
    }

    // Даём запас 16% сверху и 20% снизу под подписи и пины
    const topVal = maxPos * 1.16;
    const botVal = -maxNeg * 1.22;
    const span = Math.max(1, topVal - botVal);

    const yFor = (valRub: number) => padT + ((topVal - valRub) / span) * plotH;
    const zeroY = yFor(0);
    const colW = plotW / 12;
    const xCenter = (mIdx: number) => padL + colW * mIdx + colW / 2;

    // Сетка Y (5 уровней + обязательный 0 ₽)
    const ticks: number[] = [
      topVal * 0.82,
      topVal * 0.41,
      0,
      botVal * 0.45,
      botVal * 0.85,
    ];

    const pointsIntra = rows.map((r, idx) => ({
      idx,
      x: xCenter(idx),
      val: r.intraMonthLowBalanceRub + initialCashRub,
      y: yFor(r.intraMonthLowBalanceRub + initialCashRub),
    }));

    const pointsEnd = rows.map((r, idx) => ({
      idx,
      x: xCenter(idx),
      val: r.cumulativeCashBalanceRub + initialCashRub,
      y: yFor(r.cumulativeCashBalanceRub + initialCashRub),
    }));

    const intraPath = pointsIntra
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    const endPath = pointsEnd
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    // Заливка зоны дефицита ниже 0 ₽ по нижней внутримесячной кривой
    const deficitAreaPoints = pointsIntra.map(
      (p) => `${p.x.toFixed(1)},${Math.max(zeroY, p.y).toFixed(1)}`
    );
    const deficitPolygon =
      pointsIntra.length > 0
        ? `${pointsIntra[0].x.toFixed(1)},${zeroY.toFixed(1)} ${deficitAreaPoints.join(' ')} ${pointsIntra[
            pointsIntra.length - 1
          ].x.toFixed(1)},${zeroY.toFixed(1)}`
        : '';

    return {
      W,
      H,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      colW,
      zeroY,
      yFor,
      xCenter,
      ticks,
      pointsIntra,
      pointsEnd,
      intraPath,
      endPath,
      deficitPolygon,
    };
  }, [rows, initialCashRub]);

  return (
    <div
      id={id}
      className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-5 scroll-mt-24"
    >
      {/* Шапка блока + интерактивные настройки оборотного капитала */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              Детализация показателя «Пик своих денег»
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {scenarioTitle} · 12 месяцев {year}
            </span>
          </div>
          <h3 className="text-[17px] font-bold text-slate-900 mt-1.5">
            Когда именно наступает пик вложений, из каких платежей складывается и когда закупки выходят в плюс из WB
          </h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Разделены 2 точки каждого месяца:{' '}
            <strong className="text-amber-700">нижняя точка внутри месяца</strong> (после оплаты авансов и доплат фабрикам, ДО прихода выручки WB) и{' '}
            <strong className="text-emerald-700">остаток на конец месяца</strong> (ПОСЛЕ зачисления выплат WB).
          </p>
        </div>

        {/* Управление параметрами кэша и лага выплат WB */}
        {(onChangeInitialCashMln || onChangeWbLagMonths) && (
          <div className="flex flex-wrap items-center gap-2.5 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2">
            {onToggleWbScheduleSpecified && (
              <button
                type="button"
                onClick={onToggleWbScheduleSpecified}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  wbScheduleSpecified
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {wbScheduleSpecified ? '✓ График выплат WB учтён' : '⚠ Выплаты WB не заданы'}
              </button>
            )}
            {onChangeWbLagMonths && wbScheduleSpecified && (
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <span>Лаг выплат WB:</span>
                <select
                  value={wbLagMonths}
                  onChange={(e) => onChangeWbLagMonths(Number(e.target.value) || 0)}
                  className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-900 font-bold text-[11px]"
                >
                  <option value={0}>В том же мес. (0 мес.)</option>
                  <option value={1}>Через +1 мес.</option>
                  <option value={2}>Через +2 мес.</option>
                </select>
              </label>
            )}
            {onChangeInitialCashMln && (
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <span>Кэш на старте:</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={initialCashMln}
                  onChange={(e) =>
                    onChangeInitialCashMln(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white text-right font-bold text-slate-900 text-[11px] tabular-nums"
                />
                <span className="text-slate-500">млн ₽</span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* 4 карточки «Анатомия Пика своих денег» */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* 1. КОГДА НАСТУПАЕТ ПИК */}
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50/45 p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                1 · Когда происходит пик денег
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                Месяц №{peakIdx + 1}
              </span>
            </div>
            <div className="text-[22px] font-black text-slate-900 mt-1 leading-tight">
              {peakMonthNominative} {year}
            </div>
            <div className="text-[11px] font-semibold text-amber-900 mt-1">
              {investmentSummary.peakWindowHumanRu ||
                (isIntraMonthPeak
                  ? `1–15 ${MONTHS_FULL_GENITIVE[peakIdx]} ${year} · до прихода выплат WB`
                  : `Конец ${MONTHS_FULL_GENITIVE[peakIdx]} ${year} · после всех расчётов`)}
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-amber-200/70 text-[11px] text-slate-700 flex items-center justify-between">
            <span>Месяцев в просадке:</span>
            <strong className="font-bold text-slate-900 tabular-nums">
              {ownMoneyPeakRub > 0 ? `${monthsInDeficit} из 12 мес.` : '0 мес. (хватает старта)'}
            </strong>
          </div>
        </div>

        {/* 2. ФОРМУЛА ПИКА РУБЛЬ-В-РУБЛЬ */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                2 · Расчёт пика в {peakMonthAblative}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 tabular-nums">
                {fmtExactRub(ownMoneyPeakRub)}
              </span>
            </div>
            <div className="text-[22px] font-black text-amber-700 mt-1 tabular-nums leading-tight">
              {wbScheduleSpecified ? fmtMlnRub(ownMoneyPeakRub) : 'Укажите лаг WB'}
            </div>
            <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-600 tabular-nums">
              <div className="flex justify-between">
                <span>На 1-е число ({investmentSummary.peakMonthLabel}):</span>
                <span className="font-semibold text-slate-800">{fmtSignedMlnRub(openingAtPeak, 2)}</span>
              </div>
              <div className="flex justify-between">
                <span>− Авансы и доплаты фабрикам:</span>
                <span className="font-semibold text-rose-700">
                  −{fmtMlnRub(prepayAtPeak + balanceAtPeak, 2)}
                </span>
              </div>
              {!isIntraMonthPeak && wbAtPeak > 0 && (
                <div className="flex justify-between">
                  <span>+ Выплаты WB за месяц:</span>
                  <span className="font-semibold text-emerald-700">+{fmtMlnRub(wbAtPeak, 2)}</span>
                </div>
              )}
              {initialCashRub > 0 && (
                <div className="flex justify-between">
                  <span>+ Свои деньги на старте:</span>
                  <span className="font-semibold text-emerald-700">+{fmtMlnRub(initialCashRub, 2)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-200/80 text-[10px] text-slate-500 flex justify-between tabular-nums">
            <span>К концу {MONTHS_FULL_GENITIVE[peakIdx]} (после WB +{fmtMlnRub(wbAtPeak, 1)}):</span>
            <strong className={endAtPeak + initialCashRub < 0 ? 'text-rose-700' : 'text-emerald-700'}>
              {fmtSignedMlnRub(endAtPeak + initialCashRub, 2)}
            </strong>
          </div>
        </div>

        {/* 3. ВЫХОД В САМООКУПАЕМОСТЬ ИЗ ВЫРУЧКИ WB */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                3 · Точка выхода в чистый плюс
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                Из оборота WB
              </span>
            </div>
            <div className="text-[22px] font-black text-emerald-900 mt-1 leading-tight">
              {selfFundingGenitive
                ? `С ${selfFundingGenitive} ${year}`
                : investmentSummary.yearEndCashBalanceRub + initialCashRub >= 0
                ? `В декабре ${year}`
                : `Переход на ${year + 1}`}
            </div>
            <div className="text-[11px] text-emerald-900/85 mt-1 leading-snug">
              {selfFundingGenitive
                ? `Накопленный баланс устойчиво выше 0 ₽ — следующие партии оплачиваются пришедшей выручкой WB без доливки своих средств.`
                : `Высокая доля закупа под заказы / конец года: возврат кэша завершается в следующем цикле продаж.`}
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-emerald-200/70 text-[11px] text-emerald-950 flex items-center justify-between tabular-nums">
            <span>Баланс на 31 дек {year}:</span>
            <strong className="font-bold">
              {fmtSignedMlnRub(investmentSummary.yearEndCashBalanceRub + initialCashRub, 1)}
            </strong>
          </div>
        </div>

        {/* 4. ОТДАЧА НА ВЛОЖЕННЫЙ КАПИТАЛ (CASH ROI) */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/35 p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                4 · Эффективность своего рубля
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900">
                Cash ROI
              </span>
            </div>
            <div className="text-[22px] font-black text-indigo-950 mt-1 tabular-nums leading-tight">
              {cashRoiMultiple !== null
                ? `×${cashRoiMultiple.toFixed(1).replace('.', ',')}`
                : 'Без доп. своих ₽'}
            </div>
            <div className="text-[11px] text-slate-600 mt-1 leading-snug">
              Прибыль {fmtMlnRub(investmentSummary.annualEstimatedOperatingProfitRub, 1)} на{' '}
              {fmtMlnRub(ownMoneyPeakRub, 2)} пикового собственного капитала.
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-indigo-200/70 text-[11px] text-indigo-950 flex items-center justify-between tabular-nums">
            <span>Закупки за счёт оборота WB:</span>
            <strong className="font-bold">{wbFundedSharePct}% годового закупа</strong>
          </div>
        </div>
      </div>

      {/* Переключатель слоёв и легенда подробного графика */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
            <span className="w-5 h-0.5 border-b-2 border-dashed border-amber-600 inline-block" />
            Минимум внутри месяца (до прихода WB) — Пик своих денег
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
            <span className="w-5 h-0.5 bg-emerald-600 inline-block rounded-full" />
            Остаток на конец месяца (после выплат WB)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400/75 inline-block" />
            + Выплаты WB
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-400 inline-block" />
            − Авансы фабрикам
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-400 inline-block" />
            − Доплаты к приходу
          </span>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
          {(
            [
              { id: 'all', label: 'Все слои' },
              { id: 'curves', label: 'Только кривые баланса' },
              { id: 'bars', label: 'Платежи мес.' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setChartLayerMode(opt.id)}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                chartLayerMode === opt.id
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Двухслойный интерактивный SVG-график 12 месяцев */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-2 sm:p-3 overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartGeom.W} ${chartGeom.H}`}
          className="w-full min-w-[740px] h-auto select-none"
          role="img"
          aria-label={`Подробный график Пика своих денег и денежного потока по 12 месяцам ${year}`}
        >
          <defs>
            <linearGradient id="peakDeficitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0.24" />
            </linearGradient>
            <linearGradient id="positiveZoneBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="negativeZoneBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fffbeb" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ffe4e6" stopOpacity="0.45" />
            </linearGradient>
          </defs>

          {/* Зона выше 0 ₽ (Плюс из оборота WB) и ниже 0 ₽ (Свои деньги в работе) */}
          <rect
            x={chartGeom.padL}
            y={chartGeom.padT}
            width={chartGeom.plotW}
            height={Math.max(0, chartGeom.zeroY - chartGeom.padT)}
            fill="url(#positiveZoneBg)"
          />
          <rect
            x={chartGeom.padL}
            y={chartGeom.zeroY}
            width={chartGeom.plotW}
            height={Math.max(0, chartGeom.H - chartGeom.padB - chartGeom.zeroY)}
            fill="url(#negativeZoneBg)"
          />

          {/* Горизонтальная сетка и подписи оси Y */}
          {chartGeom.ticks.map((tVal, i) => {
            const y = chartGeom.yFor(tVal);
            const isZero = Math.abs(tVal) < 1;
            return (
              <g key={i}>
                <line
                  x1={chartGeom.padL}
                  y1={y}
                  x2={chartGeom.W - chartGeom.padR}
                  y2={y}
                  stroke={isZero ? '#334155' : '#cbd5e1'}
                  strokeWidth={isZero ? 1.6 : 0.8}
                  strokeDasharray={isZero ? '6 4' : '2 3'}
                />
                <text
                  x={chartGeom.padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fontWeight={isZero ? '800' : '600'}
                  fill={isZero ? '#0f172a' : tVal < 0 ? '#be123c' : '#475569'}
                >
                  {isZero
                    ? '0 ₽'
                    : `${tVal > 0 ? '+' : '−'}${Math.abs(tVal / 1_000_000).toFixed(0)} млн`}
                </text>
              </g>
            );
          })}

          {/* Подписи зон у правого края линии 0 ₽ */}
          <text
            x={chartGeom.W - chartGeom.padR - 6}
            y={Math.max(chartGeom.padT + 12, chartGeom.zeroY - 7)}
            textAnchor="end"
            fontSize="10"
            fontWeight="700"
            fill="#047857"
          >
            ▲ Плюс на счёте (оборот WB)
          </text>
          <text
            x={chartGeom.W - chartGeom.padR - 6}
            y={Math.min(chartGeom.H - chartGeom.padB - 6, chartGeom.zeroY + 14)}
            textAnchor="end"
            fontSize="10"
            fontWeight="700"
            fill="#b45309"
          >
            ▼ Зона вложенных своих денег (кассовая просадка)
          </text>

          {/* Выделение выбранного месяца и колонки пика */}
          {rows.map((r, mIdx) => {
            const colX = chartGeom.padL + mIdx * chartGeom.colW;
            const isSelected = mIdx === selectedMonthIdx;
            const isPeak = mIdx === peakIdx && ownMoneyPeakRub > 0;
            return (
              <g key={`bg-col-${r.monthIdx}`}>
                {(isSelected || isPeak) && (
                  <rect
                    x={colX + 2}
                    y={chartGeom.padT}
                    width={chartGeom.colW - 4}
                    height={chartGeom.plotH}
                    rx={8}
                    fill={isPeak ? '#fef3c7' : '#e2e8f0'}
                    fillOpacity={isSelected ? 0.55 : 0.32}
                    stroke={isPeak ? '#f59e0b' : '#94a3b8'}
                    strokeWidth={isSelected ? 1.2 : 0.7}
                    strokeOpacity={0.6}
                  />
                )}
              </g>
            );
          })}

          {/* Заливка зоны дефицита под 0 ₽ */}
          {chartLayerMode !== 'bars' && chartGeom.deficitPolygon && (
            <polygon points={chartGeom.deficitPolygon} fill="url(#peakDeficitFill)" />
          )}

          {/* Столбцы денежных потоков месяца: +WB вверх, −Аванс и −Доплата вниз */}
          {chartLayerMode !== 'curves' &&
            rows.map((r, mIdx) => {
              const cx = chartGeom.xCenter(mIdx);
              const barW = Math.min(22, chartGeom.colW * 0.28);

              const wbTopY = chartGeom.yFor(r.wbNetInflowRub);
              const wbH = Math.max(0, chartGeom.zeroY - wbTopY);

              const prepayBotY = chartGeom.yFor(-r.factoryPrepaymentOutflowRub);
              const prepayH = Math.max(0, prepayBotY - chartGeom.zeroY);

              const totalOutBotY = chartGeom.yFor(-r.factoryTotalOutflowRub);
              const balanceH = Math.max(0, totalOutBotY - prepayBotY);

              return (
                <g key={`bars-${r.monthIdx}`}>
                  {/* Вверх: + Выплаты WB */}
                  {wbH > 0.5 && (
                    <rect
                      x={cx - barW - 1.5}
                      y={wbTopY}
                      width={barW}
                      height={wbH}
                      rx={3}
                      fill="#34d399"
                      fillOpacity={0.72}
                    />
                  )}
                  {/* Вниз: − Авансы фабрикам (30%) */}
                  {prepayH > 0.5 && (
                    <rect
                      x={cx + 1.5}
                      y={chartGeom.zeroY}
                      width={barW}
                      height={prepayH}
                      rx={2}
                      fill="#f59e0b"
                      fillOpacity={0.85}
                    />
                  )}
                  {/* Вниз: − Доплаты фабрикам (70%) */}
                  {balanceH > 0.5 && (
                    <rect
                      x={cx + 1.5}
                      y={prepayBotY}
                      width={barW}
                      height={balanceH}
                      rx={2}
                      fill="#fb7185"
                      fillOpacity={0.85}
                    />
                  )}
                </g>
              );
            })}

          {/* Две кривые баланса */}
          {chartLayerMode !== 'bars' && (
            <>
              {/* 1) Пунктирная янтарно-алая: минимум внутри месяца ДО выплат WB */}
              <path
                d={chartGeom.intraPath}
                fill="none"
                stroke="#d97706"
                strokeWidth={2.6}
                strokeDasharray="6 4"
              />

              {/* 2) Сплошная изумрудная: баланс на конец месяца ПОСЛЕ выплат WB */}
              <path
                d={chartGeom.endPath}
                fill="none"
                stroke="#059669"
                strokeWidth={3}
              />

              {/* Точки на обеих кривых */}
              {chartGeom.pointsIntra.map((pt) => {
                const isPeak = pt.idx === peakIdx && ownMoneyPeakRub > 0;
                return (
                  <circle
                    key={`pt-intra-${pt.idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={isPeak ? 6.5 : 4}
                    fill={isPeak ? '#dc2626' : '#f59e0b'}
                    stroke="#ffffff"
                    strokeWidth={isPeak ? 2.2 : 1.5}
                  />
                );
              })}

              {chartGeom.pointsEnd.map((pt) => {
                const isCrossover =
                  selfFundingIdx !== null &&
                  selfFundingIdx !== undefined &&
                  pt.idx === selfFundingIdx;
                return (
                  <circle
                    key={`pt-end-${pt.idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={isCrossover ? 6.5 : 4.2}
                    fill={pt.val < 0 ? '#e11d48' : '#059669'}
                    stroke="#ffffff"
                    strokeWidth={isCrossover ? 2.2 : 1.5}
                  />
                );
              })}

              {/* Пин «ПИК СВОИХ ДЕНЕГ» на точном месяце и нижней точке */}
              {ownMoneyPeakRub > 0 && chartGeom.pointsIntra[peakIdx] && (() => {
                const targetPt = isIntraMonthPeak
                  ? chartGeom.pointsIntra[peakIdx]
                  : chartGeom.pointsEnd[peakIdx];
                const badgeW = 218;
                const badgeH = 26;
                const clampedX = Math.min(
                  chartGeom.W - chartGeom.padR - badgeW,
                  Math.max(chartGeom.padL + 4, targetPt.x - badgeW / 2)
                );
                const placeBelow = targetPt.y + badgeH + 14 < chartGeom.H - chartGeom.padB;
                const badgeY = placeBelow ? targetPt.y + 10 : targetPt.y - badgeH - 10;
                return (
                  <g>
                    <rect
                      x={clampedX}
                      y={badgeY}
                      width={badgeW}
                      height={badgeH}
                      rx={7}
                      fill="#7c2d12"
                      stroke="#fbbf24"
                      strokeWidth={1.4}
                    />
                    <text
                      x={clampedX + badgeW / 2}
                      y={badgeY + 17}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="800"
                      fill="#fef3c7"
                    >
                      {`📍 ПИК (${rows[peakIdx]?.monthLabel}): −${fmtMlnRub(ownMoneyPeakRub, 2)}`}
                    </text>
                  </g>
                );
              })()}

              {/* Пин «В ПЛЮС ИЗ ОБОРОТА WB» на месяце самоокупаемости */}
              {selfFundingIdx !== null &&
                selfFundingIdx !== undefined &&
                chartGeom.pointsEnd[selfFundingIdx] && (() => {
                  const pt = chartGeom.pointsEnd[selfFundingIdx];
                  const badgeW = 166;
                  const badgeH = 24;
                  const clampedX = Math.min(
                    chartGeom.W - chartGeom.padR - badgeW,
                    Math.max(chartGeom.padL + 4, pt.x - badgeW / 2)
                  );
                  const badgeY = Math.max(chartGeom.padT + 4, pt.y - badgeH - 10);
                  return (
                    <g>
                      <rect
                        x={clampedX}
                        y={badgeY}
                        width={badgeW}
                        height={badgeH}
                        rx={7}
                        fill="#065f46"
                        stroke="#6ee7b7"
                        strokeWidth={1.2}
                      />
                      <text
                        x={clampedX + badgeW / 2}
                        y={badgeY + 16}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="800"
                        fill="#ecfdf5"
                      >
                        {`✓ В плюс с ${rows[selfFundingIdx]?.monthLabel} (${fmtSignedMlnRub(pt.val, 1)})`}
                      </text>
                    </g>
                  );
                })()}
            </>
          )}

          {/* Ось X (12 месяцев + подписи сумм + кликабельные колонки) */}
          {rows.map((r, mIdx) => {
            const colX = chartGeom.padL + mIdx * chartGeom.colW;
            const cx = chartGeom.xCenter(mIdx);
            const isSelected = mIdx === selectedMonthIdx;
            const isPeak = mIdx === peakIdx && ownMoneyPeakRub > 0;
            const lowWithInit = r.intraMonthLowBalanceRub + initialCashRub;

            return (
              <g
                key={`axis-${r.monthIdx}`}
                onClick={() => setSelectedMonthIdx(mIdx)}
                className="cursor-pointer"
              >
                <rect
                  x={colX}
                  y={chartGeom.padT}
                  width={chartGeom.colW}
                  height={chartGeom.H - chartGeom.padT}
                  fill="transparent"
                />
                <text
                  x={cx}
                  y={chartGeom.H - 28}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight={isSelected || isPeak ? '800' : '600'}
                  fill={isPeak ? '#b45309' : isSelected ? '#0f172a' : '#475569'}
                >
                  {r.monthLabel}
                </text>
                <text
                  x={cx}
                  y={chartGeom.H - 12}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill={lowWithInit < 0 ? '#be123c' : '#047857'}
                >
                  {`${lowWithInit < 0 ? '−' : '+'}${Math.abs(lowWithInit / 1_000_000).toFixed(1)}М`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Интерактивный разбор выбранного месяца (по клику на любой из 12 месяцев) */}
      {selectedRow && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 mr-1">
                Выберите месяц для разбора:
              </span>
              {rows.map((r, idx) => {
                const isSel = idx === selectedMonthIdx;
                const isPk = idx === peakIdx && ownMoneyPeakRub > 0;
                const isCross =
                  selfFundingIdx !== null && selfFundingIdx !== undefined && idx === selfFundingIdx;
                return (
                  <button
                    key={r.monthIdx}
                    type="button"
                    onClick={() => setSelectedMonthIdx(idx)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      isSel
                        ? 'bg-slate-900 text-white shadow-xs'
                        : isPk
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                        : isCross
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {r.monthLabel}
                    {isPk ? ' 📍' : isCross ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>

            {selectedScheduleRow && selectedScheduleRow.waveTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {selectedScheduleRow.waveTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Пошаговая формула выбранного месяца */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-[11px] tabular-nums">
            <div className="bg-white rounded-lg border border-slate-200/90 p-2.5">
              <div className="text-slate-500 text-[10px]">1. На 1-е {MONTHS_FULL_GENITIVE[selectedMonthIdx]}</div>
              <div className="text-[14px] font-bold text-slate-900 mt-0.5">
                {fmtSignedMlnRub(selectedRow.openingCashBalanceRub + initialCashRub, 2)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-amber-200/80 p-2.5">
              <div className="text-amber-800 text-[10px]">2. − Авансы фабрикам</div>
              <div className="text-[14px] font-bold text-amber-700 mt-0.5">
                {selectedRow.factoryPrepaymentOutflowRub > 0
                  ? `−${fmtMlnRub(selectedRow.factoryPrepaymentOutflowRub, 2)}`
                  : '0 млн ₽'}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-rose-200/80 p-2.5">
              <div className="text-rose-800 text-[10px]">3. − Доплаты к приходу</div>
              <div className="text-[14px] font-bold text-rose-700 mt-0.5">
                {selectedRow.factoryBalanceOutflowRub > 0
                  ? `−${fmtMlnRub(selectedRow.factoryBalanceOutflowRub, 2)}`
                  : '0 млн ₽'}
              </div>
            </div>
            <div
              className={`rounded-lg border p-2.5 ${
                selectedRow.intraMonthLowBalanceRub + initialCashRub < 0
                  ? 'bg-amber-50/90 border-amber-300'
                  : 'bg-white border-slate-200/90'
              }`}
            >
              <div className="text-amber-900 font-semibold text-[10px]">
                4. ⚡ Минимум внутри мес. (до WB)
              </div>
              <div
                className={`text-[14px] font-black mt-0.5 ${
                  selectedRow.intraMonthLowBalanceRub + initialCashRub < 0
                    ? 'text-rose-700'
                    : 'text-emerald-700'
                }`}
              >
                {fmtSignedMlnRub(selectedRow.intraMonthLowBalanceRub + initialCashRub, 2)}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-emerald-200/80 p-2.5">
              <div className="text-emerald-800 text-[10px]">5. + Выплаты с WB (чист.)</div>
              <div className="text-[14px] font-bold text-emerald-700 mt-0.5">
                +{fmtMlnRub(selectedRow.wbNetInflowRub, 2)}
              </div>
            </div>
            <div
              className={`rounded-lg border p-2.5 ${
                selectedRow.cumulativeCashBalanceRub + initialCashRub >= 0
                  ? 'bg-emerald-50/80 border-emerald-300'
                  : 'bg-rose-50/70 border-rose-200'
              }`}
            >
              <div className="text-slate-700 font-semibold text-[10px]">
                6. = На конец {MONTHS_FULL_GENITIVE[selectedMonthIdx]}
              </div>
              <div
                className={`text-[14px] font-black mt-0.5 ${
                  selectedRow.cumulativeCashBalanceRub + initialCashRub >= 0
                    ? 'text-emerald-800'
                    : 'text-rose-700'
                }`}
              >
                {fmtSignedMlnRub(selectedRow.cumulativeCashBalanceRub + initialCashRub, 2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Помесячная сверка в таблице (с раздельными строками Авансов, Доплат и Внутримесячного Пика) */}
      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="text-[12px] font-bold text-slate-800">
            Помесячная таблица движения денег и сверка «Пика своих денег» (млн ₽)
          </div>
          <button
            type="button"
            onClick={() => setTableExpanded((v) => !v)}
            className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 px-2.5 py-1 rounded-lg bg-indigo-50/70 border border-indigo-200/70"
          >
            {tableExpanded ? 'Свернуть таблицу ▴' : 'Показать полную таблицу 12 мес. ▾'}
          </button>
        </div>

        {tableExpanded && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-[11px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2 px-3 font-semibold min-w-[230px]">Статья движения денег</th>
                  {rows.map((r, idx) => (
                    <th
                      key={r.monthIdx}
                      onClick={() => setSelectedMonthIdx(idx)}
                      className={`py-2 px-2 text-right font-bold cursor-pointer ${
                        idx === peakIdx && ownMoneyPeakRub > 0
                          ? 'bg-amber-100/80 text-amber-950'
                          : idx === selectedMonthIdx
                          ? 'bg-slate-200/60 text-slate-900'
                          : ''
                      }`}
                    >
                      {r.monthLabel}
                      {idx === peakIdx && ownMoneyPeakRub > 0 ? ' 📍' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                <tr>
                  <td className="py-2 px-3 text-slate-600">Выручка продаж (выкупы WB)</td>
                  {rows.map((r) => (
                    <td key={r.monthIdx} className="py-2 px-2 text-right text-slate-700">
                      {(r.grossSalesRub / 1_000_000).toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-3 text-emerald-800 font-medium">
                    + Поступления с WB (после комиссии и рекламы)
                  </td>
                  {rows.map((r) => (
                    <td key={r.monthIdx} className="py-2 px-2 text-right text-emerald-700 font-semibold">
                      +{(r.wbNetInflowRub / 1_000_000).toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-3 text-amber-800">
                    − Авансы фабрикам (при размещении заказа)
                  </td>
                  {rows.map((r) => (
                    <td key={r.monthIdx} className="py-2 px-2 text-right text-amber-700">
                      {r.factoryPrepaymentOutflowRub > 0
                        ? `−${(r.factoryPrepaymentOutflowRub / 1_000_000).toFixed(1)}`
                        : '0.0'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-3 text-rose-800">
                    − Доплаты фабрикам (к отгрузке / приходу)
                  </td>
                  {rows.map((r) => (
                    <td key={r.monthIdx} className="py-2 px-2 text-right text-rose-700">
                      {r.factoryBalanceOutflowRub > 0
                        ? `−${(r.factoryBalanceOutflowRub / 1_000_000).toFixed(1)}`
                        : '0.0'}
                    </td>
                  ))}
                </tr>
                <tr className="bg-amber-50/65 font-bold">
                  <td className="py-2.5 px-3 text-amber-950">
                    ⚡ Минимум внутри мес. до выплат WB (минус = пик своих ₽)
                  </td>
                  {rows.map((r, idx) => {
                    const val = r.intraMonthLowBalanceRub + initialCashRub;
                    const isPk = idx === peakIdx && ownMoneyPeakRub > 0;
                    return (
                      <td
                        key={r.monthIdx}
                        className={`py-2.5 px-2 text-right ${
                          isPk
                            ? 'bg-amber-200/80 text-rose-900 font-black ring-1 ring-inset ring-amber-400'
                            : val < 0
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {(val / 1_000_000).toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-slate-50/90 font-bold">
                  <td className="py-2.5 px-3 text-slate-900">
                    = Остаток кэша на конец месяца (после выплат WB)
                  </td>
                  {rows.map((r, idx) => {
                    const val = r.cumulativeCashBalanceRub + initialCashRub;
                    const isCross =
                      selfFundingIdx !== null && selfFundingIdx !== undefined && idx === selfFundingIdx;
                    return (
                      <td
                        key={r.monthIdx}
                        className={`py-2.5 px-2 text-right ${
                          isCross
                            ? 'bg-emerald-100/90 text-emerald-900 font-black'
                            : val < 0
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {(val / 1_000_000).toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
