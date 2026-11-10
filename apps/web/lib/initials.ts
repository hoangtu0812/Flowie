/**
 * Up to two initials for an avatar fallback, read from the person's name only.
 * A notification an MCP agent caused is named "Person · agent"; the part after
 * the middle dot names the agent, so it is dropped instead of becoming "PHT·f".
 * One word gives one letter, several give the first and last word's letters, and
 * an empty name gives an empty string so the fallback is an empty circle.
 * VI: Tối đa hai chữ cái viết tắt cho fallback avatar, chỉ lấy từ tên người.
 * Thông báo do agent MCP tạo có tên "Người · agent"; phần sau dấu chấm giữa là
 * tên agent nên bị bỏ, thay vì thành "PHT·f". Một từ cho một chữ, nhiều từ cho
 * chữ đầu của từ đầu và từ cuối, tên rỗng cho chuỗi rỗng nên fallback là vòng
 * tròn trống.
 */
export function initials(name: string): string {
   const words = name.split('·')[0].trim().split(/\s+/).filter(Boolean);
   const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
   return picked.map((word) => Array.from(word)[0].toUpperCase()).join('');
}
