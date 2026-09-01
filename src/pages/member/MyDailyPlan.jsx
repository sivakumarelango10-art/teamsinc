import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { planningApi } from '../../api/planningApi';
import { Calendar, Building2, Users, CheckCircle, ArrowRight } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import LoadingSpinner from '../../components/common/LoadingSpinner';

export const MyDailyPlan = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [todayData, setTodayData] = useState({ plan: null, assignment: null, teammates: [] });
  const [tomorrowData, setTomorrowData] = useState({ plan: null, assignment: null, teammates: [] });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  useEffect(() => {
    const loadPlans = async () => {
      if (!user?.id) return;
      try {
        setLoading(true);
        const [todayRes, tomorrowRes] = await Promise.all([
          planningApi.getDailyAllocations(todayStr),
          planningApi.getDailyAllocations(tomorrowStr)
        ]);

        const todayAsgn = todayRes.assignments?.find(a => a.user_id === user.id) || null;
        const todayTeammates = todayAsgn
          ? todayRes.assignments.filter(a => a.department_id === todayAsgn.department_id && a.user_id !== user.id)
          : [];

        const tomorrowAsgn = tomorrowRes.assignments?.find(a => a.user_id === user.id) || null;
        const tomorrowTeammates = tomorrowAsgn
          ? tomorrowRes.assignments.filter(a => a.department_id === tomorrowAsgn.department_id && a.user_id !== user.id)
          : [];

        setTodayData({ plan: todayRes.plan, assignment: todayAsgn, teammates: todayTeammates });
        setTomorrowData({ plan: tomorrowRes.plan, assignment: tomorrowAsgn, teammates: tomorrowTeammates });
      } catch (err) {
        console.error('Failed to load my daily plan:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPlans();
  }, [user?.id]);

  if (loading) {
    return <LoadingSpinner text="Retrieving your department schedule..." size="large" />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Calendar className="w-7 h-7 text-indigo-400" />
          My Daily Work Plan
        </h1>
        <p className="text-xs md:text-sm text-slate-400 mt-1">
          Review which department you are assigned to for Today and Tomorrow, along with your peer teammates.
        </p>
      </div>

      {/* Date Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TODAY CARD */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-indigo-500/40 relative overflow-hidden glow-indigo">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-400">
                  CURRENT SCHEDULE
                </span>
                <h3 className="text-2xl font-black text-white">TODAY</h3>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {format(new Date(), 'EEEE, MMM d')}
            </span>
          </div>

          <div className="space-y-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Department
              </span>
              <div className="text-xl font-bold text-white flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-indigo-400" />
                <span>{todayData.assignment?.department?.name || 'Not Assigned'}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {todayData.assignment?.department?.description ||
                  'No department allocation has been scheduled for you today. Please check with your Admin.'}
              </p>
            </div>

            {/* Teammates assigned to the same department today */}
            {todayData.assignment && (
              <div className="pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs mb-2.5">
                  <span className="text-slate-400 font-medium">Teammates with you today:</span>
                  <span className="font-bold text-indigo-400">
                    {todayData.teammates.length} {todayData.teammates.length === 1 ? 'member' : 'members'}
                  </span>
                </div>

                {todayData.teammates.length > 0 ? (
                  <div className="space-y-1.5">
                    {todayData.teammates.map((tm) => (
                      <div
                        key={tm.id}
                        className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs"
                      >
                        <div className="w-6 h-6 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center justify-center font-bold text-[10px]">
                          {tm.user?.full_name?.charAt(0) || 'U'}
                        </div>
                        <span className="font-semibold text-slate-200">{tm.user?.full_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    You are currently the primary member in this department today.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* TOMORROW CARD */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-emerald-500/40 relative overflow-hidden glow-emerald">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400">
                  UPCOMING SCHEDULE
                </span>
                <h3 className="text-2xl font-black text-white">TOMORROW</h3>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {format(addDays(new Date(), 1), 'EEEE, MMM d')}
            </span>
          </div>

          <div className="space-y-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                Department
              </span>
              <div className="text-xl font-bold text-white flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <span>{tomorrowData.assignment?.department?.name || 'Schedule Pending'}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {tomorrowData.assignment?.department?.description ||
                  'Your assignment for tomorrow is currently pending confirmation from your manager.'}
              </p>
            </div>

            {/* Teammates assigned tomorrow */}
            {tomorrowData.assignment && (
              <div className="pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs mb-2.5">
                  <span className="text-slate-400 font-medium">Teammates planned with you:</span>
                  <span className="font-bold text-emerald-400">
                    {tomorrowData.teammates.length} {tomorrowData.teammates.length === 1 ? 'member' : 'members'}
                  </span>
                </div>

                {tomorrowData.teammates.length > 0 ? (
                  <div className="space-y-1.5">
                    {tomorrowData.teammates.map((tm) => (
                      <div
                        key={tm.id}
                        className="flex items-center gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs"
                      >
                        <div className="w-6 h-6 rounded-full bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 flex items-center justify-center font-bold text-[10px]">
                          {tm.user?.full_name?.charAt(0) || 'U'}
                        </div>
                        <span className="font-semibold text-slate-200">{tm.user?.full_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    You are currently the primary member planned for this department tomorrow.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyDailyPlan;
