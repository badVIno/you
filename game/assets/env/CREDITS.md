# Окружение: источники и лицензии

Все ассеты этой папки — производные от CC0-материалов [Poly Haven](https://polyhaven.com)
(лицензия [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/),
public domain: можно использовать, изменять и распространять без указания авторства;
авторы перечислены из уважения). Файлы пересобираются скриптом
`build_env_assets.py` из оригиналов, скачанных через https://api.polyhaven.com.

| Файлы | Ассет | Автор | Источник | Лицензия | Обработка |
|---|---|---|---|---|---|
| `misty_pines_1k.hdr` | Misty Pines (HDRI) | Greg Zaal | https://polyhaven.com/a/misty_pines | CC0 | оригинал 1k RGBE, освещение (PMREM) |
| `misty_pines_bg.jpg` | Misty Pines (HDRI) | Greg Zaal | https://polyhaven.com/a/misty_pines | CC0 | из 4k: linear/8 → sRGB JPEG 4096×2048, всё ниже ~15° растворено в цвете дымки |
| `bark_diff.jpg`, `bark_nor.jpg`, `bark_arm.jpg` | Pine Bark | Dimitrios Savva | https://polyhaven.com/a/pine_bark | CC0 | 2k → 1k |
| `floor_a_diff.jpg`, `floor_a_nor.jpg`, `floor_a_arm.jpg` | Forest Leaves 04 | Rob Tuytel | https://polyhaven.com/a/forest_leaves_04 | CC0 | альбедо 2k, нормаль/ARM 1k |
| `floor_b_diff.jpg`, `floor_b_nor.jpg`, `floor_b_arm.jpg` | Forest Ground 01 | Rob Tuytel | https://polyhaven.com/a/forrest_ground_01 | CC0 | 2k → 1k |
| `deadwood_diff.jpg` | Dry Branches Medium 01 | Rico Cilliers | https://polyhaven.com/a/dry_branches_medium_01 | CC0 | 1k → 512 |
| `pine_spray.webp` | Pine Tree 01 (twig) | Rob Tuytel, Rico Cilliers | https://polyhaven.com/a/pine_tree_01 | CC0 | веточки собраны в карточку ветви 1024², альфа |
| `fern_frond.webp` | Fern 02 | Rob Tuytel, Rico Cilliers | https://polyhaven.com/a/fern_02 | CC0 | вырезана одна вайя 256×1024, альфа |
| `grass_tufts.webp` | Grass Medium 01 | Rob Tuytel, Rico Cilliers | https://polyhaven.com/a/grass_medium_01 | CC0 | атлас 2×2 (сухая/зелёная), альфа |
