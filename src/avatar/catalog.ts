import type { Accessory, HairStyle, Outfit, ShoeStyle } from './appearance';

/** Một lựa chọn hiển thị trong UI tùy chỉnh nhân vật. */
export interface CatalogItem<T extends string> {
  id: T;
  /** Nhãn tiếng Việt hiển thị trên nút chọn. */
  label: string;
  /** Mô tả ngắn tiếng Việt. */
  description: string;
}

export const hairStyles: readonly CatalogItem<HairStyle>[] = [
  { id: 'short', label: 'Tóc ngắn', description: 'Gọn gàng, phù hợp công sở.' },
  { id: 'bob', label: 'Tóc bob', description: 'Ngang vai, bo nhẹ quanh mặt.' },
  { id: 'long', label: 'Tóc dài', description: 'Xõa dài sau lưng.' },
  { id: 'bun', label: 'Búi cao', description: 'Búi gọn phía sau đầu.' },
  { id: 'spiky', label: 'Tóc dựng', description: 'Dựng đứng, năng động.' },
  { id: 'curly', label: 'Tóc xoăn', description: 'Xoăn bồng, nhiều lọn nhỏ.' },
  { id: 'buzz', label: 'Tóc đinh', description: 'Cắt sát da đầu.' },
  { id: 'ponytail', label: 'Tóc buộc đuôi ngựa', description: 'Buộc cao sau gáy.' },
];

export const outfits: readonly CatalogItem<Outfit>[] = [
  { id: 'shirt-tie', label: 'Sơ mi cà vạt', description: 'Sơ mi và cà vạt cho ngày làm việc.' },
  { id: 'blazer', label: 'Áo vest', description: 'Vest ngoài, lịch sự cho cuộc họp.' },
  { id: 'dress', label: 'Váy công sở', description: 'Váy dài gọn, kiểu công sở.' },
  { id: 'casual', label: 'Thường phục', description: 'Áo thun và quần thoải mái.' },
  { id: 'party-suit', label: 'Vest tiệc', description: 'Vest có viền, dùng cho tiệc cuối năm.' },
  { id: 'ao-dai', label: 'Áo dài', description: 'Trang phục truyền thống Việt Nam.' },
  { id: 'uniform-karaoke', label: 'Đồng phục văn nghệ', description: 'Đồng phục đi hát và sự kiện nội bộ.' },
  { id: 'polo-office', label: 'Áo polo đồng phục', description: 'Polo trắng viền xanh đậm, kèm dây đeo thẻ đỏ cam và quần tây.' },
  { id: 'shirt-white', label: 'Sơ mi trắng tay dài', description: 'Sơ mi trắng sơ vin, quần tây, thắt lưng da.' },
  { id: 'shirt-blue', label: 'Sơ mi xanh nhạt', description: 'Sơ mi xanh nhạt tay dài, sơ vin cùng quần tây.' },
  { id: 'vest-navy', label: 'Áo khoác vest xanh đậm', description: 'Vest xanh đậm ngoài sơ mi trắng, dùng cho họp và tiếp khách.' },
  { id: 'cardigan-gray', label: 'Áo cardigan xám', description: 'Cardigan xám cài cúc, mặc ngoài áo thun trắng.' },
  { id: 'trousers-dark', label: 'Quần tây tối', description: 'Áo sơ mi màu tự chọn với quần tây tối có ly và thắt lưng.' },
  { id: 'skirt-office', label: 'Váy công sở tối', description: 'Áo cánh với chân váy bút chì tối dài tới gối.' },
  { id: 'security-uniform', label: 'Đồng phục bảo vệ', description: 'Đồng phục xanh đậm có huy hiệu, cầu vai và thắt lưng bản rộng.' },
  { id: 'ao-dai-nam', label: 'Áo dài nam', description: 'Áo dài nam cổ đứng, cài cúc bên, quần ống rộng. Dùng cho dịp lễ.' },
  { id: 'ao-dai-nu', label: 'Áo dài nữ', description: 'Áo dài nữ ôm thân, tà dài, quần ống rộng. Dùng cho dịp lễ.' },
  { id: 'ao-ba-ba', label: 'Áo bà ba', description: 'Áo bà ba cài cúc giữa với quần lụa ống rộng, trang phục miền Nam.' },
  { id: 'sport-jersey', label: 'Áo thể thao', description: 'Áo thi đấu có sọc bên và quần short dài tới gần gối.' },
  { id: 'tracksuit', label: 'Bộ đồ thể thao', description: 'Áo khoác kéo khoá và quần dài có sọc bên, dùng cho ngày hội thể thao.' },
  { id: 'evening-gown', label: 'Đầm dạ hội', description: 'Đầm dài chấm đất, cổ kín, tay dài, thắt eo. Kín đáo cho tiệc tối.' },
  { id: 'tuxedo', label: 'Lễ phục tuxedo', description: 'Vest đen ve satin, nơ đen, sơ mi trắng. Dùng cho tiệc tối.' },
];

/**
 * Nhóm trang phục để hiển thị khi chọn. src/onboarding/creatorOptions.ts nên dùng bảng này thay cho OUTFIT_GROUPS
 * tự khai báo, để trang phục mới tự xuất hiện. Mỗi id Outfit xuất hiện đúng một lần.
 */
export const outfitGroups: readonly { label: string; ids: readonly Outfit[] }[] = [
  { label: 'Ngày thường', ids: ['casual', 'dress', 'cardigan-gray', 'trousers-dark', 'skirt-office'] },
  { label: 'Công sở', ids: ['polo-office', 'shirt-white', 'shirt-blue', 'shirt-tie', 'blazer', 'vest-navy', 'security-uniform'] },
  { label: 'Lễ hội truyền thống', ids: ['ao-dai-nu', 'ao-dai-nam', 'ao-ba-ba', 'ao-dai'] },
  { label: 'Thể thao', ids: ['sport-jersey', 'tracksuit'] },
  { label: 'Dạ hội', ids: ['evening-gown', 'tuxedo', 'party-suit'] },
  { label: 'Văn nghệ', ids: ['uniform-karaoke'] },
];

export const accessories: readonly CatalogItem<Accessory>[] = [
  { id: 'glasses', label: 'Kính cận', description: 'Gọng kính mảnh.' },
  { id: 'watch', label: 'Đồng hồ', description: 'Đồng hồ đeo cổ tay trái.' },
  { id: 'name-badge', label: 'Thẻ tên', description: 'Thẻ tên gắn trên ngực.' },
  { id: 'lanyard', label: 'Dây đeo thẻ', description: 'Dây đeo cổ giữ thẻ tên.' },
  { id: 'pin-brooch', label: 'Ghim cài áo', description: 'Ghim nhỏ cài ở ngực trái.' },
  { id: 'cufflinks', label: 'Khuy măng sét', description: 'Khuy trang trí ở cổ tay áo.' },
  { id: 'scarf', label: 'Khăn quàng', description: 'Khăn quàng cổ.' },
  { id: 'bowtie', label: 'Nơ bướm', description: 'Nơ bướm thay cà vạt.' },
  { id: 'hat-party', label: 'Mũ tiệc', description: 'Mũ giấy nhọn đội dịp tiệc.' },
];

export const shoes: readonly CatalogItem<ShoeStyle>[] = [
  { id: 'oxford', label: 'Giày da', description: 'Giày da buộc dây, lịch sự.' },
  { id: 'heels', label: 'Giày cao gót', description: 'Giày cao gót, đi với váy.' },
  { id: 'sneakers', label: 'Giày thể thao', description: 'Giày thể thao êm chân.' },
];
