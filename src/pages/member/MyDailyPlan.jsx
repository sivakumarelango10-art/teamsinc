import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { planningApi } from '../../api/planningApi';
import { supabase } from '../../api/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { Calendar, Building2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Avatar from '../../components/common/Avatar';

export const MyDailyPlan = () => {
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [todayData, setTodayData] = useState({ plan: null, assignment: null, teammates: [] });
  const [tomorrowData, setTomorrowData] = useState({ plan: null, assignment: null, teammates: [] });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const tomorrowStr = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const memberId = profile?.id || user?.id;
  const memberEmail = profile?.email?.toLowerCase() || user?.email?.toLowerCase();

  const loadPlans = useCallback(async (isSilent = false) => {
    if (!memberId) return;
    try {
      if (!isSilent) setLoading(true);
      const [todayRes, tomorrowRes] = await Promise.all([
        planningApi.getDailyAllocations(todayStr),
        planningApi.getDailyAllocations(tomorrowStr)
      ]);

      const matchesUser = (a) =>
        a.user_id === memberId ||
        (a.user && a.user.email?.toLowerCase() === memberEmail);

      const todayAsgn = todayRes.assignments?.find(matchesUser) || null;
      const todayTeammates = todayAsgn
        ? todayRes.assignments.filter(a => a.department_id === todayAsgn.department_id && !matchesUser(a))
        : [];

      const tomorrowAsgn = tomorrowRes.assignments?.find(matchesUser) || null;
      const tomorrowTeammates = tomorrowAsgn
        ? tomorrowRes.assignments.filter(a => a.department_id === tomorrowAsgn.department_id && !matchesUser(a))
        : [];

      setTodayData({ plan: todayRes.plan, assignment: todayAsgn, teammates: todayTeammates });
      setTomorrowData({ plan: tomorrowRes.plan, assignment: tomorrowAsgn, teammates: tomorrowTeammates });
    } catch (err) {
      console.error('Failed to load my daily plan:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [memberId, memberEmail, todayStr, tomorrowStr]);

  useEffect(() => {
    loadPlans(false);
  }, [loadPlans]);

  // Real-time synchronization for daily schedules
  useRealtime(
    ['daily_assignments', 'daily_plans'],
    () => loadPlans(true),
    { channelPrefix: 'my_daily_plan', broadcastChannel: 'teamsync_bc_daily_plans' }
  );

  if (loading) {
    return <LoadingSpinner text="Retrieving your department schedule..." size="large" />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Calendar className="w-7 h-7 text-white" />
          My Daily Work Plan
        </h1>
        <p className="text-xs md:text-sm text-neutral-400 mt-1">
          Review which department you are assigned to for Today and Tomorrow, along with your peer teammates.
        </p>
      </div>

      {/* Date Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TODAY CARD */}
        <div className="bg-neutral-950 p-6 sm:p-8 rounded-3xl border border-neutral-800 relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-850">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-neutral-900 text-white border border-neutral-800">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-neutral-400">
                  CURRENT SCHEDULE
                </span>
                <h3 className="text-2xl font-black text-white">TODAY</h3>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-neutral-300">
              {format(new Date(), 'EEEE, MMM d')}
            </span>
          </div>

          <div className="space-y-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                Department
              </span>
              <div className="text-xl font-bold text-white flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-white" />
                <span>{todayData.assignment?.department?.name || 'Not Assigned'}</span>
              </div>
              <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                {todayData.assignment?.department?.description ||
                  'No department allocation has been scheduled for you today. Please check with your Admin.'}
              </p>
            </div>

            {/* Teammates assigned to the same department today */}
            {todayData.assignment && (
              <div className="pt-4 border-t border-neutral-850">
                <div className="flex items-center justify-between text-xs mb-2.5">
                  <span className="text-neutral-400 font-medium">Teammates with you today:</span>
                  <span className="font-bold text-white">
                    {todayData.teammates.length} {todayData.teammates.length === 1 ? 'member' : 'members'}
                  </span>
                </div>

                {todayData.teammates.length > 0 ? (
                  <div className="space-y-1.5">
                    {todayData.teammates.map((tm) => (
                      <div
                        key={tm.id}
                        className="flex items-center gap-2 p-2 rounded-xl bg-black border border-neutral-800 text-xs"
                      >
                        <Avatar
                          src={tm.user?.avatar_url}
                          name={tm.user?.full_name}
                          size="w-6 h-6 text-[10px]"
                          rounded="rounded"
                        />
                        <span className="font-semibold text-neutral-200">{tm.user?.full_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 italic">
                    You are currently the primary member in this department today.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* TOMORROW CARD */}
        <div className="bg-neutral-950 p-6 sm:p-8 rounded-3xl border border-neutral-800 relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-850">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-neutral-900 text-white border border-neutral-800">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-neutral-400">
                  UPCOMING SCHEDULE
                </span>
                <h3 className="text-2xl font-black text-white">TOMORROW</h3>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-neutral-300">
              {format(addDays(new Date(), 1), 'EEEE, MMM d')}
            </span>
          </div>

          <div className="space-y-5">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-1">
                Department
              </span>
              <div className="text-xl font-bold text-white flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-white" />
                <span>{tomorrowData.assignment?.department?.name || 'Schedule Pending'}</span>
              </div>
              <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                {tomorrowData.assignment?.department?.description ||
                  'Your assignment for tomorrow is currently pending confirmation from your manager.'}
              </p>
            </div>

            {/* Teammates assigned tomorrow */}
            {tomorrowData.assignment && (
              <div className="pt-4 border-t border-neutral-850">
                <div className="flex items-center justify-between text-xs mb-2.5">
                  <span className="text-neutral-400 font-medium">Teammates planned with you:</span>
                  <span className="font-bold text-white">
                    {tomorrowData.teammates.length} {tomorrowData.teammates.length === 1 ? 'member' : 'members'}
                  </span>
                </div>

                {tomorrowData.teammates.length > 0 ? (
                  <div className="space-y-1.5">
                    {tomorrowData.teammates.map((tm) => (
                      <div
                        key={tm.id}
                        className="flex items-center gap-2 p-2 rounded-xl bg-black border border-neutral-800 text-xs"
                      >
                        <Avatar
                          src={tm.user?.avatar_url}
                          name={tm.user?.full_name}
                          size="w-6 h-6 text-[10px]"
                          rounded="rounded"
                        />
                        <span className="font-semibold text-neutral-200">{tm.user?.full_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500 italic">
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
