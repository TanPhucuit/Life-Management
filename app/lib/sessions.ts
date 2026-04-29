// Mock sessions data - Extended for April 2026

interface Session {
  id: string;
  task_id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  session_date: string;
  in_time_status: 'in_time' | 'out_time';
  focused_minutes: number;
}

export const mockSessions: Session[] = [
  // Week 1: April 1-7
  // April 1
  { id: '1', task_id: '1', user_id: '1', start_time: '2026-04-01T09:00:00', end_time: '2026-04-01T10:30:00', session_date: '2026-04-01', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '2', task_id: '1', user_id: '1', start_time: '2026-04-01T14:00:00', end_time: '2026-04-01T15:30:00', session_date: '2026-04-01', in_time_status: 'in_time', focused_minutes: 90 },
  // April 2
  { id: '3', task_id: '2', user_id: '1', start_time: '2026-04-02T08:00:00', end_time: '2026-04-02T09:30:00', session_date: '2026-04-02', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '4', task_id: '2', user_id: '1', start_time: '2026-04-02T15:00:00', end_time: '2026-04-02T16:00:00', session_date: '2026-04-02', in_time_status: 'out_time', focused_minutes: 60 },
  // April 3
  { id: '5', task_id: '1', user_id: '1', start_time: '2026-04-03T10:00:00', end_time: '2026-04-03T11:30:00', session_date: '2026-04-03', in_time_status: 'in_time', focused_minutes: 90 },
  // April 4
  { id: '6', task_id: '3', user_id: '1', start_time: '2026-04-04T09:00:00', end_time: '2026-04-04T10:30:00', session_date: '2026-04-04', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '7', task_id: '3', user_id: '1', start_time: '2026-04-04T14:00:00', end_time: '2026-04-04T15:30:00', session_date: '2026-04-04', in_time_status: 'in_time', focused_minutes: 90 },
  // April 5
  { id: '8', task_id: '1', user_id: '1', start_time: '2026-04-05T08:00:00', end_time: '2026-04-05T10:00:00', session_date: '2026-04-05', in_time_status: 'in_time', focused_minutes: 120 },
  // April 6
  { id: '9', task_id: '2', user_id: '1', start_time: '2026-04-06T09:00:00', end_time: '2026-04-06T10:30:00', session_date: '2026-04-06', in_time_status: 'in_time', focused_minutes: 90 },
  // April 7
  { id: '10', task_id: '3', user_id: '1', start_time: '2026-04-07T10:00:00', end_time: '2026-04-07T11:30:00', session_date: '2026-04-07', in_time_status: 'in_time', focused_minutes: 90 },

  // Week 2: April 8-14
  // April 8
  { id: '11', task_id: '1', user_id: '1', start_time: '2026-04-08T09:00:00', end_time: '2026-04-08T10:30:00', session_date: '2026-04-08', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '12', task_id: '1', user_id: '1', start_time: '2026-04-08T14:00:00', end_time: '2026-04-08T15:30:00', session_date: '2026-04-08', in_time_status: 'in_time', focused_minutes: 90 },
  // April 9
  { id: '13', task_id: '2', user_id: '1', start_time: '2026-04-09T08:00:00', end_time: '2026-04-09T09:30:00', session_date: '2026-04-09', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '14', task_id: '2', user_id: '1', start_time: '2026-04-09T16:00:00', end_time: '2026-04-09T17:30:00', session_date: '2026-04-09', in_time_status: 'out_time', focused_minutes: 90 },
  // April 10
  { id: '15', task_id: '3', user_id: '1', start_time: '2026-04-10T10:00:00', end_time: '2026-04-10T12:00:00', session_date: '2026-04-10', in_time_status: 'in_time', focused_minutes: 120 },
  // April 11
  { id: '16', task_id: '1', user_id: '1', start_time: '2026-04-11T09:00:00', end_time: '2026-04-11T10:30:00', session_date: '2026-04-11', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '17', task_id: '1', user_id: '1', start_time: '2026-04-11T15:00:00', end_time: '2026-04-11T16:00:00', session_date: '2026-04-11', in_time_status: 'in_time', focused_minutes: 60 },
  // April 12
  { id: '18', task_id: '2', user_id: '1', start_time: '2026-04-12T08:00:00', end_time: '2026-04-12T09:30:00', session_date: '2026-04-12', in_time_status: 'in_time', focused_minutes: 90 },
  // April 13
  { id: '19', task_id: '3', user_id: '1', start_time: '2026-04-13T10:00:00', end_time: '2026-04-13T11:30:00', session_date: '2026-04-13', in_time_status: 'in_time', focused_minutes: 90 },
  // April 14
  { id: '20', task_id: '1', user_id: '1', start_time: '2026-04-14T09:00:00', end_time: '2026-04-14T10:30:00', session_date: '2026-04-14', in_time_status: 'in_time', focused_minutes: 90 },

  // Week 3: April 15-21
  // April 15
  { id: '21', task_id: '2', user_id: '1', start_time: '2026-04-15T08:00:00', end_time: '2026-04-15T10:00:00', session_date: '2026-04-15', in_time_status: 'in_time', focused_minutes: 120 },
  { id: '22', task_id: '2', user_id: '1', start_time: '2026-04-15T14:00:00', end_time: '2026-04-15T15:00:00', session_date: '2026-04-15', in_time_status: 'in_time', focused_minutes: 60 },
  // April 16
  { id: '23', task_id: '3', user_id: '1', start_time: '2026-04-16T09:00:00', end_time: '2026-04-16T10:30:00', session_date: '2026-04-16', in_time_status: 'in_time', focused_minutes: 90 },
  // April 17
  { id: '24', task_id: '1', user_id: '1', start_time: '2026-04-17T10:00:00', end_time: '2026-04-17T11:30:00', session_date: '2026-04-17', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '25', task_id: '1', user_id: '1', start_time: '2026-04-17T15:00:00', end_time: '2026-04-17T16:30:00', session_date: '2026-04-17', in_time_status: 'out_time', focused_minutes: 90 },
  // April 18
  { id: '26', task_id: '2', user_id: '1', start_time: '2026-04-18T08:00:00', end_time: '2026-04-18T09:30:00', session_date: '2026-04-18', in_time_status: 'in_time', focused_minutes: 90 },
  // April 19
  { id: '27', task_id: '3', user_id: '1', start_time: '2026-04-19T09:00:00', end_time: '2026-04-19T10:30:00', session_date: '2026-04-19', in_time_status: 'in_time', focused_minutes: 90 },
  // April 20
  { id: '28', task_id: '1', user_id: '1', start_time: '2026-04-20T09:00:00', end_time: '2026-04-20T10:30:00', session_date: '2026-04-20', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '29', task_id: '1', user_id: '1', start_time: '2026-04-20T14:00:00', end_time: '2026-04-20T15:30:00', session_date: '2026-04-20', in_time_status: 'in_time', focused_minutes: 90 },
  // April 21
  { id: '30', task_id: '2', user_id: '1', start_time: '2026-04-21T10:00:00', end_time: '2026-04-21T11:30:00', session_date: '2026-04-21', in_time_status: 'in_time', focused_minutes: 90 },

  // Week 4: April 22-28
  // April 22
  { id: '31', task_id: '1', user_id: '1', start_time: '2026-04-22T08:00:00', end_time: '2026-04-22T10:00:00', session_date: '2026-04-22', in_time_status: 'in_time', focused_minutes: 120 },
  { id: '32', task_id: '1', user_id: '1', start_time: '2026-04-22T15:00:00', end_time: '2026-04-22T16:00:00', session_date: '2026-04-22', in_time_status: 'out_time', focused_minutes: 60 },
  // April 23
  { id: '33', task_id: '3', user_id: '1', start_time: '2026-04-23T09:00:00', end_time: '2026-04-23T10:30:00', session_date: '2026-04-23', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '34', task_id: '3', user_id: '1', start_time: '2026-04-23T14:00:00', end_time: '2026-04-23T15:30:00', session_date: '2026-04-23', in_time_status: 'in_time', focused_minutes: 90 },
  // April 24
  { id: '35', task_id: '2', user_id: '1', start_time: '2026-04-24T08:00:00', end_time: '2026-04-24T09:30:00', session_date: '2026-04-24', in_time_status: 'in_time', focused_minutes: 90 },
  { id: '36', task_id: '2', user_id: '1', start_time: '2026-04-24T16:00:00', end_time: '2026-04-24T17:30:00', session_date: '2026-04-24', in_time_status: 'out_time', focused_minutes: 90 },
  // April 25
  { id: '37', task_id: '1', user_id: '1', start_time: '2026-04-25T10:00:00', end_time: '2026-04-25T12:00:00', session_date: '2026-04-25', in_time_status: 'in_time', focused_minutes: 120 },
  // April 26 (Today)
  { id: '38', task_id: '3', user_id: '1', start_time: '2026-04-26T09:30:00', end_time: '2026-04-26T10:30:00', session_date: '2026-04-26', in_time_status: 'in_time', focused_minutes: 60 },
  { id: '39', task_id: '3', user_id: '1', start_time: '2026-04-26T14:00:00', end_time: '2026-04-26T15:00:00', session_date: '2026-04-26', in_time_status: 'in_time', focused_minutes: 60 },
  // April 27
  { id: '40', task_id: '1', user_id: '1', start_time: '2026-04-27T09:00:00', end_time: '2026-04-27T10:30:00', session_date: '2026-04-27', in_time_status: 'in_time', focused_minutes: 90 },
  // April 28
  { id: '41', task_id: '2', user_id: '1', start_time: '2026-04-28T08:00:00', end_time: '2026-04-28T09:30:00', session_date: '2026-04-28', in_time_status: 'in_time', focused_minutes: 90 },
];
