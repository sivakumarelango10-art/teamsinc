import React, { useState, useEffect } from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  Filter,
  Layers,
  GraduationCap,
  Users,
  CheckSquare,
  BarChart3,
  Clock,
  Loader2
} from 'lucide-react';
import { ticketsApi } from '../../api/ticketsApi';
import { useAuth } from '../../hooks/useAuth';

const FORMAT_OPTIONS = [
  {
    id: 'pdf',
    title: 'PDF Document',
    subtitle: 'Formatted PDF with headers, pagination, and clean tables for printing & review',
    icon: FileText,
    badge: 'Formatted PDF',
    extension: '.pdf',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/30'
  },
  {
    id: 'docx',
    title: 'DOCS / DOCX',
    subtitle: 'Editable document compatible with Microsoft Word & Google Docs',
    icon: FileCode,
    badge: 'Microsoft Word / Docs',
    extension: '.docx',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30'
  },
  {
    id: 'csv',
    title: 'CSV Spreadsheet',
    subtitle: 'Raw UTF-8 tabular data with RFC 4180 escaping for Excel & data analysis',
    icon: FileSpreadsheet,
    badge: 'Excel & Sheets',
    extension: '.csv',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  }
];

const RESOURCE_OPTIONS = [
  { id: 'tickets', label: 'Tickets & Reports', icon: Layers, description: 'KalviLearn bugs, features, and feedback' },
  { id: 'students', label: 'Students', icon: GraduationCap, description: 'Learner activity, submissions, and cohorts' },
  { id: 'mentors', label: 'Mentors', icon: Users, description: 'Mentor oversight and activity' },
  { id: 'tasks', label: 'Tasks & Issues', icon: CheckSquare, description: 'TeamSync engineering tasks backlog' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, description: 'Live KPI summary and category distributions' }
];

export const ExportModal = ({
  isOpen,
  onClose,
  activeFilters = {},
  activeTicketCount = 0
}) => {
  const { profile, role, isFounder, isAdmin } = useAuth();

  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [selectedResource, setSelectedResource] = useState('tickets');
  const [useCurrentFilters, setUseCurrentFilters] = useState(true);

  // Export State Progression: 'idle' | 'preparing' | 'generating' | 'ready' | 'error'
  const [exportPhase, setExportPhase] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [downloadedFileInfo, setDownloadedFileInfo] = useState(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setExportPhase('idle');
      setStatusMessage('');
      setErrorMessage(null);
      setDownloadedFileInfo(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    if (exportPhase === 'preparing' || exportPhase === 'generating') return;

    setErrorMessage(null);
    setDownloadedFileInfo(null);

    // Step 1: Preparing
    setExportPhase('preparing');
    setStatusMessage('Preparing export...');

    // Small progressive UX delay to provide visual feedback
    await new Promise(resolve => setTimeout(resolve, 350));

    // Step 2: Generating
    setExportPhase('generating');
    const formatName = selectedFormat === 'docx' ? 'DOCX' : selectedFormat.toUpperCase();
    setStatusMessage(`Generating ${formatName}...`);

    try {
      const filters = useCurrentFilters && selectedResource === 'tickets' ? activeFilters : {};

      const result = await ticketsApi.exportData({
        format: selectedFormat,
        resource: selectedResource,
        filters,
        userRole: role || profile?.role || 'MEMBER',
        userId: profile?.id || null
      });

      // Step 3: Ready
      setExportPhase('ready');
      setStatusMessage('Export ready');
      setDownloadedFileInfo(result);
    } catch (err) {
      setExportPhase('error');
      setErrorMessage(err.message || 'Unable to generate the export. Please try again.');
    }
  };

  const isProcessing = exportPhase === 'preparing' || exportPhase === 'generating';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={() => { if (!isProcessing) onClose(); }}
    >
      <div
        className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-neutral-800 flex items-center justify-center text-white">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                <span>Export Integration Data</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  TeamSync × KalviLearn
                </span>
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Download verified real-time integration data in your preferred format.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition disabled:opacity-30 cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* 1. Resource Selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
              1. Select Data Domain
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {RESOURCE_OPTIONS.map(res => {
                const Icon = res.icon;
                const isSelected = selectedResource === res.id;
                return (
                  <button
                    key={res.id}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => { setSelectedResource(res.id); setExportPhase('idle'); }}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-white text-black border-white shadow-lg'
                        : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-black' : 'text-neutral-400'}`} />
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-black" />}
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-tight">{res.label}</p>
                      <p className={`text-[10px] mt-0.5 line-clamp-1 ${isSelected ? 'text-neutral-700' : 'text-neutral-500'}`}>
                        {res.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Format Selection */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block">
              2. Choose Export Format
            </label>
            <div className="space-y-2">
              {FORMAT_OPTIONS.map(fmt => {
                const Icon = fmt.icon;
                const isSelected = selectedFormat === fmt.id;
                return (
                  <div
                    key={fmt.id}
                    onClick={() => { if (!isProcessing) { setSelectedFormat(fmt.id); setExportPhase('idle'); } }}
                    className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-neutral-900 border-white/60 shadow-lg'
                        : 'bg-neutral-900/40 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${fmt.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-white">{fmt.title}</p>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                            {fmt.extension}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                          {fmt.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 pl-2">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-white bg-white text-black' : 'border-neutral-700'
                      }`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-black" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Scope & Filter Options (For Tickets) */}
          {selectedResource === 'tickets' && (
            <div className="p-3.5 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-400 font-medium flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Export Scope</span>
                </span>
                <span className="text-[11px] font-semibold text-neutral-300">
                  {useCurrentFilters ? `Active Filtered View (${activeTicketCount} records)` : 'All Tickets'}
                </span>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={useCurrentFilters}
                    onChange={() => setUseCurrentFilters(true)}
                    disabled={isProcessing}
                    className="accent-white cursor-pointer"
                  />
                  <span>Apply Current Hub Filters</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={!useCurrentFilters}
                    onChange={() => setUseCurrentFilters(false)}
                    disabled={isProcessing}
                    className="accent-white cursor-pointer"
                  />
                  <span>Export All Available Records</span>
                </label>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-red-950/40 border border-red-800/60 flex items-start gap-3 text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Export Failed</p>
                <p className="mt-0.5 text-red-400/90 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {exportPhase === 'ready' && downloadedFileInfo && (
            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/50 flex items-center gap-3 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold">Export ready</p>
                <p className="text-emerald-400/80 text-[11px] mt-0.5">
                  Successfully generated <strong>{downloadedFileInfo.filename}</strong>. Your download should begin automatically.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Progressive UX */}
        <div className="p-6 border-t border-neutral-800 bg-neutral-900/60 flex items-center justify-between gap-3">
          <div className="text-xs">
            {isProcessing ? (
              <div className="flex items-center gap-2 text-indigo-400 font-semibold animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            ) : exportPhase === 'ready' ? (
              <span className="text-emerald-400 font-semibold text-[11px]">
                ✓ Download complete
              </span>
            ) : (
              <span className="text-neutral-500 text-[11px]">
                Authorized role: <strong className="text-neutral-400">{role || 'MEMBER'}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isProcessing}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 text-xs font-semibold transition disabled:opacity-40 cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleExport}
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md hover:shadow-lg active:scale-95"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{statusMessage}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Generate & Download</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
