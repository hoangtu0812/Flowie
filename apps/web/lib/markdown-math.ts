import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * TeX math (`$\rightarrow$`, `$$…$$`) for react-markdown, rendered by KaTeX as native MathML
 * so no KaTeX stylesheet or fonts are needed. KaTeX keeps `trust` off, which blocks `\href`,
 * `\url` and `\includegraphics`; invalid TeX is shown in the error colour instead of failing
 * the page. A single `$` pair is math, so a sentence with two prices (`$5 and $10`) renders
 * the text between them as math unless the dollar signs are escaped (`\$`).
 * VI: Công thức TeX (`$\rightarrow$`, `$$…$$`) cho react-markdown, được KaTeX hiển thị bằng
 * VI: MathML gốc của trình duyệt nên không cần stylesheet hay font của KaTeX. KaTeX giữ `trust`
 * VI: tắt, chặn `\href`, `\url` và `\includegraphics`; TeX sai cú pháp hiện màu lỗi thay vì làm
 * VI: hỏng trang. Một cặp `$` là công thức, nên câu có hai giá trị tiền (`$5 and $10`) sẽ hiển
 * VI: thị đoạn giữa thành công thức, trừ khi viết `\$`.
 */
export const remarkMathPlugin = remarkMath;
export const rehypeMathPlugin: [typeof rehypeKatex, { output: 'mathml' }] = [
   rehypeKatex,
   { output: 'mathml' },
];
