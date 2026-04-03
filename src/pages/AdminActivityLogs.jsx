import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { Search, Loader2, RefreshCw } from 'lucide-react';
import { baseClient } from '@/api/baseClient';
import ActivityLogSummaryCards from '@/components/admin/ActivityLogSummaryCards';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin } from '@/lib/adminAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	activityLogSeverityStyles,
	getActivityLogSeverity,
	matchesActivityLogSearch,
} from '@/lib/activityLogAnalytics';

export default function AdminActivityLogs() {
	const { user } = useAuth();
	const [search, setSearch] = useState('');
	const [entityFilter, setEntityFilter] = useState('all');
	const [severityFilter, setSeverityFilter] = useState('all');
	const canViewSummaryCards = isSuperAdmin(user);

	const { data: logs = [], isLoading, isFetching, refetch } = useQuery({
		queryKey: ['admin-activity-logs'],
		queryFn: () => baseClient.entities.ActivityLog.list('-created_date', 400),
		refetchInterval: 15000,
		refetchOnWindowFocus: true,
	});

	const entityOptions = useMemo(() => {
		const entities = Array.from(new Set(logs.map((log) => log.entity_type).filter(Boolean)));
		return entities.sort((left, right) => left.localeCompare(right));
	}, [logs]);

	const filteredLogs = useMemo(() => {
		return logs.filter((log) => {
			const severity = getActivityLogSeverity(log);
			const matchesQuery = matchesActivityLogSearch(log, search);

			const matchesEntity = entityFilter === 'all' || (log.entity_type || '') === entityFilter;
			const matchesSeverity = severityFilter === 'all' || severity === severityFilter;

			return matchesQuery && matchesEntity && matchesSeverity;
		});
	}, [logs, search, entityFilter, severityFilter]);

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h1 className="font-display text-3xl font-bold text-foreground">Audit Logs Monitoring</h1>
					<p className="mt-1 text-muted-foreground">Monitor user actions, booking updates, and critical changes in near real time.</p>
				</div>
				<Button type="button" variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
					<RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
					Refresh
				</Button>
			</div>

			{canViewSummaryCards ? <ActivityLogSummaryCards logs={logs} /> : null}

			<div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
				<div className="relative">
					<Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search by user, action, or details..."
						className="pl-10"
					/>
				</div>
				<Select value={entityFilter} onValueChange={setEntityFilter}>
					<SelectTrigger>
						<SelectValue placeholder="All Entities" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Entities</SelectItem>
						{entityOptions.map((entity) => (
							<SelectItem key={entity} value={entity}>{entity}</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={severityFilter} onValueChange={setSeverityFilter}>
					<SelectTrigger>
						<SelectValue placeholder="All Severity" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Severity</SelectItem>
						<SelectItem value="high">High</SelectItem>
						<SelectItem value="medium">Medium</SelectItem>
						<SelectItem value="low">Low</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-20">
					<Loader2 className="h-8 w-8 animate-spin text-primary" />
				</div>
			) : (
				<Card>
					<CardContent className="p-0 overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead>When</TableHead>
									<TableHead>Severity</TableHead>
									<TableHead>User</TableHead>
									<TableHead>Action</TableHead>
									<TableHead>Entity</TableHead>
									<TableHead>Details</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredLogs.length === 0 ? (
									<TableRow>
										<TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
											No activity logs found.
										</TableCell>
									</TableRow>
								) : (
									filteredLogs.map((log) => (
										<TableRow key={log.id}>
											<TableCell className="whitespace-nowrap text-sm">
												{log.created_date ? format(new Date(log.created_date), 'MMM d, yyyy h:mm a') : 'Unknown'}
											</TableCell>
											<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
												{log.created_date ? `${formatDistanceToNow(new Date(log.created_date), { addSuffix: true })}` : 'Unknown'}
											</TableCell>
											<TableCell>
												<Badge variant="outline" className={activityLogSeverityStyles[getActivityLogSeverity(log)]}>
													{getActivityLogSeverity(log)}
												</Badge>
											</TableCell>
											<TableCell>
												<div>
													<p className="font-medium text-sm">{log.user_name || 'Unknown User'}</p>
													<p className="text-xs text-muted-foreground">{log.user_email || 'No email'}</p>
												</div>
											</TableCell>
											<TableCell className="font-medium">{log.action}</TableCell>
											<TableCell>
												<div>
													<p>{log.entity_type || 'Unknown'}</p>
													<p className="text-xs font-mono text-muted-foreground">{log.entity_id || 'No ID'}</p>
												</div>
											</TableCell>
											<TableCell className="max-w-md text-sm text-muted-foreground">{log.details || 'No details provided.'}</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
