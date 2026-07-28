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
          version: number;
          superseded_at: string | null;
          superseded_by: string | null;
        };
        Insert: {
          id?: string;
          uploaded_by?: string | null;
          source_file: string;
          status?: "pending" | "approved" | "rejected";
          created_at?: string;
          version?: number;
          superseded_at?: string | null;
          superseded_by?: string | null;
        };
        Update: {
          id?: string;
          uploaded_by?: string | null;
          source_file?: string;
          status?: "pending" | "approved" | "rejected";
          created_at?: string;
          version?: number;
          superseded_at?: string | null;
          superseded_by?: string | null;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          student_id: string;
          // Nullable since 0017: the seeded demo topics belong to no class,
          // and a conversation that cannot be recorded would otherwise have
          // to be silently dropped.
          class_id: string | null;
          topic_id: string;
          started_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          class_id?: string | null;
          topic_id: string;
          started_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          class_id?: string | null;
          topic_id?: string;
          started_at?: string;
        };
        Relationships: [];
      };
      conversation_turns: {
        Row: {
          id: string;
          conversation_id: string;
          role: "user" | "assistant";
          intent: string | null;
          text: string;
          cited_chunk_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "assistant";
          intent?: string | null;
          text: string;
          cited_chunk_ids?: string[];
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: "user" | "assistant";
          intent?: string | null;
          text?: string;
          cited_chunk_ids?: string[];
          created_at?: string;
        };
        Relationships: [];
      };
      class_enrollments: {
        Row: {
          class_id: string;
          student_id: string;
          created_at: string;
        };
        Insert: {
          class_id: string;
          student_id: string;
          created_at?: string;
        };
        Update: {
          class_id?: string;
          student_id?: string;
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
      corpus_document_media: {
        Row: {
          id: string;
          document_id: string;
          page_or_section: number;
          storage_path: string;
          width: number | null;
          height: number | null;
          kind: "figure" | "slide";
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          page_or_section: number;
          storage_path: string;
          width?: number | null;
          height?: number | null;
          kind?: "figure" | "slide";
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          page_or_section?: number;
          storage_path?: string;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      corpus_document_tables: {
        Row: {
          id: string;
          document_id: string;
          page_or_section: number;
          headers: string[];
          rows: string[][];
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          page_or_section: number;
          headers: string[];
          rows: string[][];
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          page_or_section?: number;
          headers?: string[];
          rows?: string[][];
          created_at?: string;
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
          module: string | null;
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
          module?: string | null;
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
          module?: string | null;
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
    Functions: {
      // Single-round-trip state for /teacher/ingest — returns the caller's
      // user row (for the role gate) plus their document list. Identity comes
      // from auth.uid() inside the function, so there's no user-id argument
      // to spoof. See supabase/migrations/0006_teacher_ingest_state.sql.
      teacher_ingest_state: {
        Args: { p_limit?: number };
        Returns: unknown;
      };
      // Curriculum-readiness analytics. Both are role-gated inside the
      // function and return nothing at all to a caller without the role, so
      // the page never has to decide whether it may see this.
      // See supabase/migrations/0015_analytics.sql.
      teacher_class_codes: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      rotate_class_code: {
        Args: { p_class_id: string };
        Returns: unknown;
      };
      redeem_join_code: {
        Args: { p_code: string };
        Returns: unknown;
      };
      teacher_learning_analytics: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      school_learning_analytics: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      teacher_analytics: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      school_analytics: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      // Single-round-trip upload authorisation — role gate, course/section
      // get-or-create, and the document + mapping inserts. Identity comes
      // from auth.uid() inside the function, so there's no user-id argument
      // to spoof. See supabase/migrations/0007_teacher_upload_init.sql.
      teacher_upload_init: {
        Args: {
          p_subject: string;
          p_grade: string;
          p_academic_year: string;
          p_sections: string[];
          p_files: string[];
        };
        Returns: unknown;
      };
    };
  };
};
