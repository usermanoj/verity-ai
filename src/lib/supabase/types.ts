// Minimal, hand-written subset of the schema — only the tables app code
// actually queries today (public.users, practice_attempts, events).
// Replace with CLI-generated types once a real Supabase project exists:
// `npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts`
//
// Shape must satisfy postgrest-js's GenericTable/GenericSchema constraints
// (Relationships/Views/Functions are required, not optional — omitting them
// silently degrades Insert/Update/etc. to `never` instead of erroring loudly).
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          school_id: string;
          role: "student" | "teacher" | "hod" | "principal";
          sso_subject: string | null;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          school_id: string;
          role: "student" | "teacher" | "hod" | "principal";
          sso_subject?: string | null;
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          role?: "student" | "teacher" | "hod" | "principal";
          sso_subject?: string | null;
          display_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      practice_attempts: {
        Row: {
          id: string;
          student_id: string;
          question_id: string;
          answer: string;
          graded_result: Record<string, unknown>;
          graded_by: "rule" | "llm";
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          question_id: string;
          answer: string;
          graded_result: Record<string, unknown>;
          graded_by: "rule" | "llm";
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          question_id?: string;
          answer?: string;
          graded_result?: Record<string, unknown>;
          graded_by?: "rule" | "llm";
          created_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          payload?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          payload?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
