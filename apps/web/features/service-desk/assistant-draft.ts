/**
 * Types and pure rules of the Service Desk assistant, kept free of app imports so the unit tests
 * compile them as they are.
 * VI: Kiểu dữ liệu và quy tắc thuần của trợ lý Service Desk, không import gì của app để unit test
 * VI: biên dịch được nguyên trạng.
 */

export type AssistantApplication = { projectId: string; name: string };
export type AssistantStatus = { available: boolean; applications: AssistantApplication[] };
export type AssistantSource = {
   id: string;
   documentId: string;
   title: string;
   release: number;
   heading: string;
   projectId: string;
   projectName: string;
   excerpt: string;
   canOpen: boolean;
};
export type TicketPrefill = { projectId: string | null; title: string; description: string };
export type AssistantReply = {
   status: 'answered' | 'partial' | 'not_found';
   answer: string;
   sources: AssistantSource[];
   ticket: TicketPrefill;
};
export type AssistantTurn = { role: 'user' | 'assistant'; content: string };
export type Exchange = {
   question: string;
   reply?: AssistantReply;
   error?: { status: number; message: string };
   /** The person's verdict on an answer; undefined until they choose. VI: Đánh giá của người dùng. */
   resolved?: boolean;
   /** The person turned down the ticket offer. VI: Người dùng đã từ chối lời đề nghị tạo ticket. */
   declined?: boolean;
};

// Limits accepted by POST /asks/assistant. VI: Giới hạn mà POST /asks/assistant chấp nhận.
export const MAX_QUESTION = 2_000;
const MAX_TURNS = 12;
const MAX_TURN = 4_000;
const NOT_COVERED = 'The documents do not cover this.';

/**
 * History sent with the next question: answered exchanges only, as user/assistant pairs, so the
 * roles always alternate as some providers require. An empty `not_found` answer is replaced by a
 * short sentence, because the API rejects empty turns, and long answers are cut to the API limit.
 * VI: Lịch sử gửi kèm câu hỏi tiếp theo: chỉ các lượt đã có câu trả lời, theo cặp user/assistant,
 * VI: để vai trò luôn xen kẽ như một số provider yêu cầu. Câu trả lời `not_found` rỗng được thay
 * VI: bằng một câu ngắn vì API từ chối lượt rỗng, và câu trả lời dài được cắt theo giới hạn API.
 */
export function historyFor(exchanges: Exchange[]): AssistantTurn[] {
   return exchanges
      .flatMap((exchange): AssistantTurn[] =>
         exchange.reply
            ? [
                 { role: 'user', content: exchange.question.slice(0, MAX_TURN) },
                 {
                    role: 'assistant',
                    content: (exchange.reply.answer.trim() || NOT_COVERED).slice(0, MAX_TURN),
                 },
              ]
            : []
      )
      .slice(-MAX_TURNS);
}

/**
 * Ticket prefill used when there is no reply to take one from, such as after an error: the last
 * question as title and every question quoted, so the team still sees what was asked.
 * VI: Dữ liệu điền sẵn khi không có câu trả lời để lấy, ví dụ sau khi lỗi: câu hỏi cuối làm tiêu
 * VI: đề và trích lại mọi câu hỏi, để team vẫn thấy người dùng đã hỏi gì.
 */
export function fallbackDraft(questions: string[]): TicketPrefill {
   const quoted = questions
      .map((question) =>
         question
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n')
      )
      .join('\n');
   return {
      projectId: null,
      title: (questions.at(-1) ?? '').trim().slice(0, 500),
      description: `**Trích hội thoại**\n${quoted}`.slice(0, 10_000),
   };
}

/**
 * Prefill for the always-visible "Create ticket" button: the latest reply's draft, else a
 * fallback built from the questions, else nothing when nobody has asked yet.
 * VI: Dữ liệu điền sẵn cho nút "Tạo ticket" luôn hiện: bản nháp của câu trả lời gần nhất, nếu
 * VI: không có thì dựng từ các câu hỏi, còn chưa hỏi gì thì không điền.
 */
export function latestDraft(exchanges: Exchange[]): TicketPrefill | undefined {
   const reply = [...exchanges].reverse().find((exchange) => exchange.reply)?.reply;
   if (reply) return reply.ticket;
   return exchanges.length
      ? fallbackDraft(exchanges.map((exchange) => exchange.question))
      : undefined;
}

/**
 * Whether to ask "would you like a ticket?" under a reply: when the documents fell short, or when
 * the person said the answer did not solve the problem, and until they turn the offer down.
 * VI: Có hỏi "bạn có muốn tạo ticket?" dưới câu trả lời không: khi tài liệu không đủ, hoặc khi
 * VI: người dùng nói câu trả lời chưa giải quyết được, cho tới khi họ từ chối.
 */
export function offersTicket(exchange: Exchange): boolean {
   if (!exchange.reply || exchange.declined) return false;
   return exchange.reply.status !== 'answered' || exchange.resolved === false;
}

/**
 * Project the ticket form starts on: the suggested one when the form lists it, else the first.
 * VI: Dự án form ticket chọn sẵn: dự án được gợi ý nếu có trong danh sách, nếu không thì dự án đầu.
 */
export function initialProjectId(projects: { id: string }[], suggested?: string | null): string {
   return projects.find((project) => project.id === suggested)?.id ?? projects[0]?.id ?? '';
}
