import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, FileCheck2, RotateCcw } from 'lucide-react';

interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    id: 'photo-id',
    label: 'Original Government Photo ID',
    detail: 'Passport, National ID, or State ID matching your application name.',
  },
  {
    id: 'fee-receipt',
    label: 'Paid Learner Test Fee Receipt & Paper Token',
    detail: 'Keep the physical token slip visible for counter verification.',
  },
  {
    id: 'app-form',
    label: 'Signed Learner License Application (Form 2 / DL-1)',
    detail: 'Confirm date of birth and address fields are signed.',
  },
  {
    id: 'medical-vision',
    label: 'Vision Screening / Self-Declaration Slip',
    detail: 'Bring prescription glasses or contacts if required for vision check.',
  },
  {
    id: 'slot-confirm',
    label: 'Booked Test Slot Confirmation',
    detail: 'Printed or digital booking reference SMS / confirmation page.',
  },
];

const QUICK_SIGNS: { title: string; category: string; meaning: string }[] = [
  {
    title: 'Octagon (8-Sided) Red Sign',
    category: 'Regulatory',
    meaning: 'Always means STOP completely behind the white line before proceeding.',
  },
  {
    title: 'Inverted Red Triangle',
    category: 'Regulatory',
    meaning: 'GIVE WAY / YIELD to traffic and pedestrians already in the intersection or roundabout.',
  },
  {
    title: 'Solid Double Yellow Center Line',
    category: 'Road Marking',
    meaning: 'No overtaking or crossing to pass vehicles in either direction.',
  },
  {
    title: 'Diamond-Shaped Yellow/Amber Sign',
    category: 'Warning',
    meaning: 'Advance warning of a hazard ahead (sharp curve, school zone, pedestrian crossing).',
  },
];

const STORAGE_KEY = 'driveline_doc_checklist_v1';

export const ChecklistAndPrep: React.FC = () => {
  const [checkedIds, setCheckedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as string[]) : ['fee-receipt'];
    } catch {
      return ['fee-receipt'];
    }
  });

  const [revealedSignIdx, setRevealedSignIdx] = useState<number | null>(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedIds));
    } catch {
      // Ignore storage quota issues
    }
  }, [checkedIds]);

  const toggleItem = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const completedCount = checkedIds.length;

  return (
    <section aria-label="Document readiness checklist and test refresher" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Document Checklist */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-display">
                Pre-Booth Document Checklist
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {completedCount} of {DEFAULT_CHECKLIST.length} ready before your token is called
              </p>
            </div>
          </div>

          {completedCount > 0 && (
            <button
              type="button"
              onClick={() => setCheckedIds([])}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {DEFAULT_CHECKLIST.map((item) => {
            const isChecked = checkedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className="w-full py-3.5 text-left flex items-start gap-3.5 group focus-visible:outline-2 focus-visible:outline-blue-700 rounded-lg"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                    isChecked
                      ? 'bg-blue-700 border-blue-700 text-white'
                      : 'bg-white border-slate-300 group-hover:border-slate-400'
                  }`}
                >
                  {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-medium ${
                      isChecked ? 'text-slate-500 line-through' : 'text-slate-900'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {item.detail}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* While-You-Wait Quick Refresher */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 sm:p-7">
        <div className="pb-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 font-display">
            While You Wait · Quick Sign Review
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tap any item to review high-frequency learner&apos;s test rules
          </p>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {QUICK_SIGNS.map((sign, idx) => {
            const isOpen = revealedSignIdx === idx;
            return (
              <div key={sign.title} className="py-3">
                <button
                  type="button"
                  onClick={() => setRevealedSignIdx(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between gap-3 text-left py-1.5 min-h-[40px] focus-visible:outline-2 focus-visible:outline-blue-700 rounded"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{sign.title}</p>
                    <p className="text-xs text-slate-500">{sign.category}</p>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                      isOpen ? 'rotate-90 text-blue-700' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="mt-2 pb-1 text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
                    {sign.meaning}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
