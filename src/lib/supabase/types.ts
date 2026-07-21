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
      staff_allowlist: {
        Row: {
          email: string;
          school_id: string;
          role: "teacher" | "hod" | "principal";
          created_at: string;
        };
        Insert: {
          email: string;
          school_id: string;
          role: "teacher" | "hod" | "principal";
          created_at?: string;
        };
        Update: {
          email?: string;
          school_id?: string;
          role?: "teacher" | "hod" | "principal";
          created_at?: string;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          school_id: string;
          subject: string;
          grade: string;
          academic_year: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          subject: string;
          grade: string;
          academic_year: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          subject?: string;
          grade?: string;
          academic_year?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      classes: {
        Row: {
          id: string;
          school_id: string;
          course_id: string;
          section_name: string;
          teacher_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          course_id: string;
          section_name: string;
          teacher_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          course_id?: string;
          section_name?: string;
          teacher_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      corpus_documents: {
        Row: {
          id: string;
          uploaded_by: string | null;
          source_file: string;
          status: "pending" | "approved" | "rejected";
          created_at: string;
        };
        Insert: {
          id?: string;
          uploaded_by?: string | null;
          source_file: string;
          status?: "pending" | "approved" | "rejected";
          created_at?: string;
        };
        Update: {
          id?: string;
          uploaded_by?: string | null;
          source_file?: string;
          status?: "pending" | "approved" | "rejected";
          created_at?: string;
        };
        Relationships: [];
      };
      corpus_document_sections: {
        Row: {
          document_id: string;
          class_id: string;
        };
        Insert: {
          document_id: string;
          class_id: string;
        };
        Update: {
          document_id?: string;
          class_id?: string;
        };
        Relationships: [];
      };
      corpus_chunks: {
        Row: {
          id: string;
          document_id: string;
          heading: string | null;
          text: string;
          citation: string;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          heading?: string | null;
          text: string;
          citation: string;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          heading?: string | null;
          text?: string;
          citation?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      generated_questions: {
        Row: {
          id: string;
          chunk_id: string;
          level: "Easy" | "Medium" | "Challenge";
          prompt: string;
          question: Record<string, unknown>;
          status: "pending" | "approved" | "rejected";
          generated_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chunk_id: string;
          level: "Easy" | "Medium" | "Challenge";
          prompt: string;
          question: Record<string, unknown>;
          status?: "pending" | "approved" | "rejected";
          generated_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          chunk_id?: string;
          level?: "Easy" | "Medium" | "Challenge";
          prompt?: string;
          question?: Record<string, unknown>;
          status?: "pending" | "approved" | "rejected";
          generated_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
