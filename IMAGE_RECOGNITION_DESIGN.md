# 装备图片识别系统 — 架构设计与算法文档

> 最后更新：2026-05-15  
> 核心文件：`server/src/modules/ocr/image-match.service.ts`

---

## 目录

1. [图片库体系](#1-图片库体系)
2. [核心算法：pHash 感知哈希](#2-核心算法phash-感知哈希)
3. [图片预处理管线](#3-图片预处理管线)
4. [前端交互与预处理](#4-前端交互与预处理)
5. [流程一：库存装备入库识别（完整链路）](#5-流程一库存装备入库识别完整链路)
6. [流程二：死亡补装识别](#6-流程二死亡补装识别)
7. [分层匹配机制](#7-分层匹配机制)
8. [辅助检测：数量提取 / 品质检测 / 空格过滤](#8-辅助检测)
9. [截图 vs 渲染图差异分析](#9-截图-vs-渲染图差异分析)
10. [已知问题与下一步优化方案（V2.13）](#10-已知问题与下一步优化方案v213)
11. [历史试错记录](#11-历史试错记录)

---

## 1. 图片库体系

系统维护三层图片库，按优先级从高到低用于匹配：

### 1.1 hot 截图库（游戏内截图）

- **存储位置**：`uploads/catalog-hot/` 目录
- **来源**：管理员手动上传的游戏内装备截图
- **特征**：与用户截图同源（都是游戏内截图），包含品质纹理背景、角标等
- **entity 字段**：`equipment_image` 表，`imageType = 'hot'`
- **匹配优先级**：最高（最接近用户截图）
- **pHash 计算方式**：每次匹配时实时从文件读取 → cropCenter(0.7) → computePhash

### 1.2 pHash 参考库（Albion 渲染图 + 本地缓存）

- **存储位置**：`uploads/catalog/` 目录（本地缓存的渲染图）
- **来源**：从 Albion Data API 下载的官方渲染图
- **特征**：纯白/透明背景，无角标，无品质纹理，装备主体占比 85-95%
- **entity 字段**：`equipment_catalog` 表的 `imagePhash`、`localImagePath`、`imageUrl` 字段
- **匹配优先级**：中等
- **pHash 计算方式**：预计算存储在 `imagePhash` 字段，通过 `batchGeneratePhash()` 批量生成
- **图片来源优先级**：hotImagePath > localImagePath > imageUrl（远程URL）

### 1.3 official 官网图片库（大规模 fallback）

- **存储位置**：`downloads/official-image-library/ImageResources/` 目录
- **来源**：Albion 官方数据包，包含所有装备的多品质渲染图
- **文件命名**：`{albionId}-Quality={N}.png`
- **特征**：与 pHash 参考库类似，但覆盖面更广（含所有品质变体）
- **匹配优先级**：最低（lazy 加载，仅在前两层都未命中时使用）
- **pHash 计算方式**：匹配时实时计算（`buildOfficialFallbackHashes`，限制 3000 张）

### 1.4 渲染图角标特征

**重要修正**：渲染图并非纯净无角标，实际情况为：
- **左上角**：有罗马数字等级标记（与截图一致）
- **左下角**：有宝石符号代表品质（与截图一致）
- **右上角**：无（截图中补装流程有附魔星标，库存流程无）
- **右下角**：无（截图中库存流程有堆叠数量数字，补装流程无）

---

## 2. 核心算法：pHash 感知哈希

### 2.1 算法步骤

```
输入图片 Buffer
  → flatten(background: black)     // 消除 alpha 通道（PNG透明→黑色）
  → resize(32×32, fit: 'fill')     // 统一尺寸
  → grayscale()                     // 转灰度（单通道）
  → raw().toBuffer()                // 获取 32×32 = 1024 个灰度像素值
  → 构建 32×32 二维矩阵
  → DCT-II 二维离散余弦变换
  → 取左上角 8×8 低频系数（排除 DC 分量 [0][0]）→ 63 个值
  → 计算中值 median
  → 二值化：> median 为 '1'，否则为 '0'（DC 位固定为 '0'）→ 64 bit
  → 转为 16 字符十六进制字符串
```

代码位置：`computePhash()` 方法（L928-976）

### 2.2 DCT-II 变换

```
先做行变换：rowDct[y][u] = Σ(x=0..31) matrix[y][x] × cos((2x+1)·u·π / 64)
再做列变换：result[v][u] = Σ(y=0..31) rowDct[y][u] × cos((2y+1)·v·π / 64)
```

DCT 将空间域信号转换为频率域。左上角低频系数代表图像整体结构，对微小变化（压缩、缩放、轻微旋转）不敏感。

### 2.3 汉明距离匹配

```typescript
hammingDistance(hash1, hash2): number
// hex → binary → 逐位异或统计不同位数
// 距离范围：0（完全相同）~ 64（完全不同）
// 相似度 = 1 - distance / 64
```

### 2.4 匹配阈值

| 场景 | 阈值 | 相似度 | 说明 |
|---|---|---|---|
| **严格模式**（库存入库） | ≤ 19/64 | ≥ 70% | `STRICT_HAMMING_THRESHOLD = 19` |
| **宽松模式**（击杀详情补装） | ≤ 25/64 | ≥ 60% | `LOOSE_HAMMING_THRESHOLD = 25` |
| **歧义差距**（已弃用） | ≥ 3 | - | `AMBIGUITY_GAP = 3`，V2.9.6.1 取消 |

V2.9.6.1 取消歧义检验原因：参考库装备数量多时，同名不同品质的 best 和 second best 差距永远 < 3，导致绝大多数匹配被丢弃。改为直接取 best 结果。

---

## 3. 图片预处理管线

### 3.1 当前预处理（cropCenter + maskCorners）

#### maskCorners — 角标遮盖（L871-922）

```
遮盖区域：
- 左上角 20%×20%（罗马数字等级）→ 纯黑填充
- 右上角 20%×20%（附魔五角星）→ 纯黑填充
- 右下角 25%×25%（数量数字）→ 纯黑填充
```

#### cropCenter — 中心裁剪（L844-863）

```
1. 先调用 maskCorners 遮盖角标
2. 裁剪中心 ratio% 区域（参考库用 0.6，hot/official 用 0.7）
   cropW = width × ratio
   cropH = height × ratio
   left = (width - cropW) / 2
   top = (height - cropH) / 2
```

### 3.2 参考库 pHash 生成的预处理（generatePhashForCatalog, L248-311）

```
读取图片(hotImagePath > localImagePath > remoteURL)
  → cropCenter(ratio=0.6)
    → maskCorners（遮盖左上+右上+右下）
    → extract 中心 60%
  → computePhash()
  → 结果存入 equipment_catalog.imagePhash 字段
```

### 3.3 V2.12 精确网格的中心裁剪（gridParseByRegion, L2096-2099）

```
不对称裁剪比例：
  CROP_X_RATIO = 0.15  // 左侧去 15%
  CROP_Y_RATIO = 0.12  // 顶部去 12%
  CROP_W_RATIO = 0.70  // 保留宽度 70%
  CROP_H_RATIO = 0.72  // 保留高度 72%
```

这是 V2.12 中新增的不对称裁剪，偏上裁剪以避开左上角等级标记。生成 `centerThumbnail` 供 pHash 匹配使用。

---

## 4. 前端交互与预处理

### 4.1 现有前端预处理（V2.12 遮罩框对齐）

**核心文件**：`client/src/pages/equipment/index.tsx`

#### 当前交互流程

```
用户选择容器类型（layout）
  → 上传截图（POST /upload → 返回 imageUrl）
  → 图片加载到 700×550 固定容器中
  → 容器上覆盖固定红色遮罩框（按 cols:rows 比例自适应）
  → 框内显示网格线（cols×rows 等分）+ 第一格蓝色高亮
  → 框外区域半透明变暗
  → 用户通过 鼠标拖拽 + 滚轮缩放 对齐图片
  → 点击"确认对齐"按钮
  → 前端反算 outerRect（红框在原图中的像素坐标）
  → POST /guild/{guildId}/inventory/grid-parse { imageUrl, layout, outerRect }
  → 后端做实际切图 + pHash 匹配 → 返回 cells 列表
  → 前端渲染识别结果表格供用户修改确认
```

#### 前端坐标反算逻辑

```typescript
// 容器固定尺寸
const CONTAINER_W = 700;
const CONTAINER_H = 550;

// 红框在容器中的位置（按 cols:rows 比例居中最大化，占容器 90%）
const orp = getOuterRectPct(layout);   // 返回 { left%, top%, width%, height% }
const boxLeft = CONTAINER_W * orp.left / 100;
const boxTop = CONTAINER_H * orp.top / 100;
const boxW = CONTAINER_W * orp.width / 100;
const boxH = CONTAINER_H * orp.height / 100;

// 像素比：1 个容器像素 = 多少原图像素
const pxRatio = natW / (renderedW * displayScale);

// 红框在原图中的像素坐标
const outerRect = {
  left:   Math.round((boxLeft - imgTransform.x) * pxRatio),
  top:    Math.round((boxTop - imgTransform.y) * pxRatio),
  width:  Math.round(boxW * pxRatio),
  height: Math.round(boxH * pxRatio),
};
```

#### 关键状态

| 状态 | 说明 |
|---|---|
| `imgTransform.x/y` | 图片在容器中的偏移（拖拽改变） |
| `imgTransform.scale` | 图片缩放比（滚轮改变，范围 0.1~5） |
| `gridLayout` | 容器类型，如 `guild_island_chest_5x7` |
| `gridImageUrl` | 上传后的图片 URL |
| `gridCells` | 后端返回的识别结果列表 |

#### 当前前端的局限

**前端完全没有对截图做像素级预处理**：
- 没有使用 Canvas API 进行裁剪、旋转、灰度化、遮罩等操作
- 图片缩放/定位完全通过 CSS `transform: translate + scale` 实现
- 前端只负责确定"哪块区域是装备网格"（outerRect），所有图像处理由后端完成
- 原图完整发送给后端，后端接收完整原图 + outerRect 坐标

### 4.2 参考库 pHash 重算

**前端入口**：`client/src/pages/catalog/index.tsx`

```
参考库管理页 → 顶部"生成图片指纹"按钮
  → Popconfirm 确认
  → POST /catalog/generate-phash
  → 后端 imageMatchService.batchGeneratePhash(force=true)
  → 遍历所有 equipment_catalog 记录
  → 每条：读取图片(hot > local > remote) → cropCenter(0.6) → computePhash → UPDATE imagePhash
  → 返回 { total, success, failed }
```

### 4.3 API 接口清单

| 接口 | 方法 | 用途 |
|---|---|---|
| `/upload` | POST FormData | 上传截图文件 |
| `/guild/{guildId}/inventory/grid-parse` | POST | 网格识别（传入 imageUrl + layout + outerRect） |
| `/guild/{guildId}/inventory/grid-save` | POST | 保存识别结果入库（传入装备名+等级+品质+数量列表） |
| `/catalog/generate-phash` | POST | 批量重算所有参考库 pHash（SSVIP 权限） |
| `/catalog/{id}/hot-image` | POST FormData | 上传热门装备截图 |
| `/catalog/{id}/hot-images/select` | POST | 从官网图片库选择 hot 图片 |
| `/guild/{guildId}/resupply/{id}/preview-match` | POST | 补装预览匹配 |
| `/guild/{guildId}/resupply/preview-from-url` | POST | 按 URL 预览匹配 |

### 4.4 V2.13 前端预处理增强方案

**核心思路**：在前端上传截图到后端之前，用 Canvas API 对截图做像素级预处理，减少后端计算量并提升一致性。

#### 4.4.1 前端预处理职责划分

| 处理步骤 | 当前（V2.12） | V2.13 前端预处理 | 说明 |
|---|---|---|---|
| 遮罩框对齐 | 前端 CSS | 保留 | 用户交互对齐不变 |
| 原图裁剪（按 outerRect） | 后端 | **前端 Canvas** | 前端裁剪后只传装备区域图，减少传输量 |
| 单格切图（按 cols×rows） | 后端 | 后端 | 网格等分仍由后端完成 |
| 右下角数量遮罩 | 后端 maskCorners | 后端 | 遮罩逻辑仍在后端（切图后处理） |
| 45° 旋转 | 无 | **后端** | 计算密集，保留在后端 |
| 灰度 + normalize | 无 | **后端** | pHash 计算一体化 |

#### 4.4.2 前端新增 Canvas 预裁剪

```typescript
/**
 * V2.13: 前端 Canvas 预裁剪
 * 在用户确认对齐后，用 Canvas 从原图中裁出 outerRect 区域
 * 上传裁剪后的图片（而非完整截图），减少后端处理和网络传输
 */
async function cropAndUpload(
  imgSrc: string,
  outerRect: { left: number; top: number; width: number; height: number },
): Promise<string> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imgSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = outerRect.width;
  canvas.height = outerRect.height;
  const ctx = canvas.getContext('2d')!;

  // 从原图中裁剪 outerRect 区域
  ctx.drawImage(
    img,
    outerRect.left, outerRect.top, outerRect.width, outerRect.height,
    0, 0, outerRect.width, outerRect.height,
  );

  // 转为 Blob 上传
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/png'),
  );
  const file = new File([blob], 'cropped.png', { type: 'image/png' });
  const uploadRes = await uploadFile(file);
  return uploadRes?.url || uploadRes?.filePath || '';
}
```

#### 4.4.3 修改后的前端提交流程

```
V2.13 流程：
  用户对齐 → 前端反算 outerRect → Canvas 裁剪出装备区域图
  → 上传裁剪后的图（尺寸 = outerRect.width × outerRect.height）
  → POST /guild/{guildId}/inventory/grid-parse {
      imageUrl: 裁剪后图 URL,
      layout: 'guild_island_chest_5x7',
      outerRect: { left: 0, top: 0, width: 原outerRect.width, height: 原outerRect.height },
      // 注意：裁剪后 outerRect 的 left/top 变为 0
    }
  → 后端收到的是纯装备区域图 → 直接等分切图 → 预处理 → pHash
```

**好处**：
- 后端不再需要处理完整截图（可能 3000×2000 像素），只收到装备区域（如 500×700 像素）
- 减少网络传输 60-70%
- 后端 extract 坐标 = (0,0)，减少越界风险

#### 4.4.4 后端预处理管线变更（对应修改）

后端 `gridParseByRegion` 收到的 imageBuffer 已经是纯装备区域图，后续切图不变，但每个 cell 切出后增加新预处理：

```
每格切图后的预处理管线（V2.13 新增步骤标 *）：
  1. 空格检测（avgStdDev < 18 → 丢弃）
  2. thumbnail 生成（完整格子 80×80，展示用）
  3. * 库存模式遮罩：仅右下角 25% 用灰128填充（遮盖数量数字）
  4. * 单独提取右下角数字（extractQuantityFromCorner，在遮罩前执行）
  5. * rotate(45°, { background: gray128 })
  6. * 宽矩形中心裁剪(w:85%, h:55%)
  7. * resize(32×32) → grayscale() → normalize()
  8. computePhashFromRaw → 匹配参考库
```

#### 4.4.5 参考库渲染图预处理管线变更

`batchGeneratePhash()` → `generatePhashForCatalog()` 管线同步更新：

```
读取渲染图(hot > local > remote)
  → flatten({ background: gray128 })   // * 改：黑→灰128
  → 不遮罩任何角标                       // * 改：去掉三角遮盖
  → rotate(45°, { background: gray128 })  // * 新增
  → 宽矩形中心裁剪(w:85%, h:55%)        // * 新增
  → resize(32×32)
  → grayscale()
  → normalize()                          // * 新增
  → computePhashFromRaw → 存入 imagePhash 字段
```

**部署步骤**：代码修改完成后，必须在参考库页面点击"生成图片指纹"按钮重算所有 pHash。

#### 4.4.6 补装识别预处理管线变更

`matchKillDetailSlots()` 中每格切图后：

```
  → 仅遮罩右上角 20%（灰128）  // * 改：三角遮盖→仅右上
  → rotate(45°, { background: gray128 })  // * 新增
  → 宽矩形中心裁剪(w:85%, h:55%)  // * 新增
  → resize(32×32) → grayscale() → normalize()  // * 新增 normalize
  → computePhashFromRaw → 匹配
```

### 4.5 三套管线对齐总览

```
              参考库渲染图          库存截图（前端上传）      补装截图（KOOK/手动）
              ──────────          ──────────────          ──────────────
角标遮罩:     不遮罩               仅右下角25%(灰128)       仅右上角20%(灰128)
                                   ↑数量数字               ↑附魔星标
flatten:      gray128              gray128                  gray128
旋转:         rotate(45°)          rotate(45°)              rotate(45°)
宽矩形裁剪:   w:85% h:55%          w:85% h:55%              w:85% h:55%
resize:       32×32                32×32                    32×32
灰度:         grayscale()          grayscale()              grayscale()
均衡化:       normalize()          normalize()              normalize()
pHash:        DCT→8×8→中值→64bit   DCT→8×8→中值→64bit       DCT→8×8→中值→64bit
存储:         写入 imagePhash      实时匹配                 实时匹配
```

**核心原则：参考库和截图必须经过完全相同的预处理管线（除了各自独有的角标遮罩），差异才会最小化。**

> **旋转 + 宽矩形裁剪的理由**：
> - 装备姿态普遍左低右高（约45°），旋转后装备主体"扶正"，pHash 编码结构信息更集中
> - 长条武器旋转后变水平展开，宽矩形(85%×55%)完整保留武器全长
> - 短方装备旋转后主体仍在中心，宽矩形不会切掉
> - 高度仅取55%，有效去掉品质纹理背景角落
> - 之所以不取正方形(70.7%)，是因为正方形会切断长条武器两端

---

## 5. 流程一：库存装备入库识别（完整链路）

### 5.1 入口与切图方式演进

系统支持多种切图方式，按版本演进：

| 版本 | 方法 | 切图策略 | 说明 |
|---|---|---|---|
| V2.7 | `matchFromScreenshot()` | 自动网格切割 | 估算 iconSize → detectGridRegion 行方差 → gridCut |
| V2.9.2 | `gridParseForManualInput()` | 固定 layout 等分 | 先尝试 OpenCV findContours，fallback 等分 |
| V2.9.3 | `previewMatchWithCandidates()` | 自动切割 + Top5 候选 | 每个方框返回 Top5 候选供前端确认 |
| V2.10.5 | `gridParseWithAnchor()` | 用户框选区域 + 等分 | 间隙比 5.5%，用户框选整个装备区 |
| V2.10.6 | `gridParseWith3Boxes()` | 3 框定位法 | 用户标定 3 个格子精确计算列步进、行步进 |
| **V2.12** | **`gridParseByRegion()`** | **中心点定位法** | **均匀计算中心点，88% 步长切图，不对称中心裁剪，最新主力** |

### 5.2 V2.12 gridParseByRegion 详细流程（当前主力）

```
前端传入：imageBuffer、cols、rows、outerRect（外框坐标）

1. 计算步长
   stepX = outerRect.width / cols
   stepY = outerRect.height / rows
   cellSize = min(stepX, stepY) × 0.88（排除间隙）

2. 遍历每格
   centerX = outerRect.left + (c + 0.5) × stepX
   centerY = outerRect.top + (r + 0.5) × stepY
   fullRect = center ± cellSize/2（边界安全检查）

3. 空格检测
   计算完整格子的平均标准差
   < 18 → 空格，丢弃不返回

4. 切两个版本
   thumbnail = 完整格子 → resize(80×80) → base64（展示用）
   centerThumbnail = 不对称中心裁剪(15%/12%/70%/72%) → resize(64×64) → base64（pHash 匹配用）

5. 数量提取
   裁右下角 35%×35% → 检测亮色像素占比
   标准差 > 25 → 调用 extractQuantityFromCorner()
   否则默认数量=1

6. 品质检测
   detectQualityFromBorder() — 采样边框颜色 → HSV 映射

7. 分层 pHash 匹配
   prefillGridCellsByLayeredPhash()
   hot截图 → pHash参考库 → official官网图

8. 四档状态判定
   confidence ≥ 0.70 → matched（自动匹配）
   confidence ≥ 0.50 → review（需人工确认）
   否则 → unknown（未匹配）
```

### 5.3 支持的截图类型（layout）

| 类型 | layout | 锚点 |
|---|---|---|
| 公会岛箱子 | 5×7 | "搜索/等阶/类别" |
| 军队木箱 | 5×7 | 同上 |
| 背包大 | 4×5 | "720%"红绿条 |
| 背包中 | 5×7 | 同上 |
| 背包小 | 6×8 | 同上 |
| 蛋箱 | 5×2 | "搜索/等阶/类别" |

---

## 6. 流程二：死亡补装识别

### 6.1 触发链路

```
KOOK 频道图片消息
  → kook-message.service.ts: processImageMessage()
  → Step 1: 腾讯云 OCR 识别文字+坐标
  → 判断是否为"击杀详情"弹窗（parseKillDetailWithCoords）
  → 非击杀详情 → 跳过
  → 是击杀详情 → Step 2
```

### 6.2 当前策略：文字 OCR + 官网战报匹配（V2.9.9+）

```
Step 2: 从 OCR 结果提取元数据
  - 日期（killTimeUtc）
  - 地图名（mapName）
  - 游戏 ID（gameId）
  - 公会名（guildName）

Step 3: 调用 albionService.matchDeathEvent()
  - 用 游戏ID + 时间(±5分钟) + 地图 + 公会名 查询 Albion 官网战报 API
  - 命中 → 直接使用战报中的装备列表（精确到 albionId + 等级 + 附魔 + 品质）
  - 未命中 → matchStatus = 'unmatched'，创建无装备的补装记录待人工处理

Step 4: 创建补装记录
  resupplyService.createFromKillDetail()
  - 含装备列表 + 去重哈希 + 元数据
```

### 6.3 击杀详情 pHash 匹配（matchKillDetailSlots，当前暂停使用）

```
击杀详情截图左面板固定 10 格布局：
  行0: [包]    [头盔]   [披风]
  行1: [武器]  [胸甲]   [副手]
  行2: [药水]  [鞋子]   [食物]
  行3: [空]    [坐骑]   [空]

每格中心百分比坐标（cx, cy）：
  包(0.16,0.11) 头(0.50,0.11) 披风(0.84,0.11)
  武器(0.16,0.37) 甲(0.50,0.37) 副手(0.84,0.37)
  药水(0.16,0.63) 鞋(0.50,0.63) 食物(0.84,0.63)
  坐骑(0.50,0.88)

每格尺寸：28%W × 22%H

匹配逻辑：
  1. 按百分比坐标从左面板裁切每个格子
  2. 空格检测（亮度+方差）
  3. cropCenter(0.6) → computePhash
  4. 只在对应 category 内匹配（头→头部装备，武器→武器装备）
     副手格额外搜索武器分类（双手武器可能在副手位）
  5. 按装备名分组取最佳 → 阈值判断
```

### 6.4 补装预览匹配（previewMatchFromUrl / previewMatchForResupply）

```
供前端"待识别"Tab 使用：
  - 传入补装记录 ID 或截图 URL
  - 对截图执行标准 previewMatchWithCandidates()
  - 返回每个方框的 Top5 候选（含切图 base64 + 原图坐标）
  - 前端渲染红框 + 候选列表 + 勾选确认
```

---

## 7. 分层匹配机制

`prefillGridCellsByLayeredPhash()` 方法（L2258-2395）实现三层 fallback：

```
Layer 1: hot 截图匹配（严格阈值 ≤19）
  - 从 equipment_image 表读取 imageType='hot' 的图片
  - 每张图实时 cropCenter(0.7) → computePhash
  - 与 cell 的 pHash 做汉明距离比较
  - 命中 → 返回，标记 matchSource='hot'

Layer 2: pHash 参考库匹配（宽松阈值 ≤25）
  - 从 equipment_catalog 表读取预计算的 imagePhash
  - 直接做汉明距离比较（无需实时计算参考库 pHash）
  - 命中 → 返回，标记 matchSource='phash'

Layer 3: official 官网图片库匹配（严格阈值 ≤19）
  - Lazy 加载：仅在 Layer 1 和 2 都未命中时才初始化
  - 从 official-image-library 目录读取文件
  - 按文件名匹配 albionId → 实时 cropCenter(0.7) → computePhash
  - 限制 3000 张
  - 命中 → 返回，标记 matchSource='official'

匹配结果写入 cell：
  matchedName / matchedCatalogId / matchedConfidence / matchSource
  matchedCategory / matchedGearScore / albionId
```

### cell 的 pHash 计算

```
centerThumbnail（V2.12 的不对称中心裁剪） → 直接用，不二次 cropCenter
thumbnail（旧版方形裁剪） → 需要 cropCenter(0.7) 处理后再算 pHash
```

---

## 8. 辅助检测

### 8.1 右下角数量提取（extractQuantityFromCorner, L1046-1082）

```
裁切子图右下角 35%×35%
  → 放大 3 倍（lanczos3 插值）
  → 灰度
  → linear(1.5, -30) 对比度增强
  → threshold(180) 二值化（白字黑底）
  → base64 → 腾讯云 GeneralBasicOCR
  → 提取第一个连续数字（范围 1~9999）
  → 失败返回 1（默认一件）
```

调用限制：每次识别最多 30 张子图做数量 OCR，并发 3。击杀详情模式跳过（每件=1）。

### 8.2 品质边框检测（detectQualityFromBorder, L2403-2467）

```
采样上边中央 40%宽度 × borderThickness(≈4%) 像素
  → 计算平均 RGB
  → RGB → HSV
  → 饱和度 < 25 或亮度 < 0.3 → Q0（灰/无品质）
  → 色相映射：
    绿(80-160°) → Q1
    蓝(160-260°) → Q2
    紫/红(260-340° 或 <20°) → Q3
    黄/金(20-80° 且亮度>0.5) → Q4
```

### 8.3 空格过滤

```
方法1：亮度检测
  avg < 15（纯黑）或 avg > 240（纯白）→ 空格

方法2：方差检测
  avg 在 140~220（米色背景）且 stdDev < 25（颜色均匀）→ 空格

V2.12 方法：平均标准差
  avgStdDev（所有通道标准差平均）< 18 → 空格
```

---

## 9. 截图 vs 渲染图差异分析

基于 15 张游戏截图（背包/箱子/蛋箱/公会岛箱子/木箱）和 29 张渲染图样本的对比：

### 9.1 六大差异

| 排名 | 差异 | 渲染图 | 游戏截图 | 对 pHash 的影响 |
|---|---|---|---|---|
| 1 | **品质纹理背景** | 纯白/透明 | 彩色纹理（Q0灰/Q1青/Q2橙/Q3紫/Q4金） | **最大**：背景纹理编码进哈希，同装备不同品质 pHash 差异大于不同装备同品质 |
| 2 | **右下角数量数字** | 无 | 绿底白字数字（库存截图） | 大：覆盖 15%×12% 面积 |
| 3 | **右上角附魔星标** | 无 | 蓝星标记（补装截图） | 中：覆盖 ~20%×18% 面积 |
| 4 | **品质色边框** | 有（细线） | 3-4px 品质色边框 + 外发光 | 中 |
| 5 | **压缩失真** | PNG 高质量 | 游戏引擎+截图+传输压缩 | 中：色彩偏暖偏暗 |
| 6 | **装备主体占比** | 85-95% | 55-70%（周围是背景纹理） | 小 |

### 9.2 装备姿态特征

- 装备普遍呈 **左低右高** 倾斜姿态（约 45°）
- 部分装备会 **超出方格外框**
- 标准正方形裁剪会在四角包含大量背景纹理

---

## 10. 已知问题与下一步优化方案（V2.13）

### 10.1 当前问题

1. **maskCorners 遮罩策略错误**：三角全遮盖（左上+右上+右下），但渲染图本身有左上等级和左下品质标。遮罩左上角反而破坏了两边的一致性。
2. **flatten 背景黑色**：渲染图透明区域 → 纯黑，与截图的品质纹理背景灰度差异巨大。
3. **遮罩颜色黑色**：纯黑遮罩在 DCT 低频中引入强亮度跳变。
4. **没有灰度增强**：只有 grayscale 没有直方图均衡化，截图和渲染图亮度差异未消除。
5. **没有旋转校正**：装备左低右高，标准正方形裁剪包含大量背景角落。

### 10.2 V2.13 优化方案（待实施）

#### A. 预处理管线分流

| 模式 | 遮罩策略 | 说明 |
|---|---|---|
| **catalog**（参考库渲染图） | 不遮罩任何角标 | 渲染图自带左上等级+左下品质，保留 |
| **inventory**（库存截图） | 仅遮罩右下角 25%（灰128） | 截图有堆叠数字，渲染图没有。右下角数字单独提取 |
| **resupply**（补装截图） | 仅遮罩右上角 20%（灰128） | 截图有附魔星标，渲染图没有 |

#### B. flatten 背景灰 128

透明区域填充灰 128（而非黑 0），更接近截图灰度化后的品质背景均值。

#### C. 遮罩颜色灰 128

避免 DCT 低频跳变。

#### D. 旋转45° + 宽矩形裁剪(w:85%, h:55%)

装备左低右高斜放，旋转45°后扶正。裁剪用宽矩形而非正方形：
- 宽度85%：保留长条武器全长（旋转后水平展开）
- 高度55%：去掉上下品质背景+角标残余

```
旋转 45°（sharp.rotate(45, { background: gray128 })）
  → 画布自动扩展（对角线 = 边长 × √2）
  → 宽矩形中心裁剪：w=旋转后宽度×85%, h=旋转后高度×55%
  → 长条武器完整保留，短方装备主体在中心不受影响
```

#### E. normalize() 直方图均衡化

sharp 内置 `normalize()` 将亮度范围拉伸到 0-255，消除截图和渲染图的亮度差异。

#### 预期提升

| 改进项 | 预期提升 |
|---|---|
| 遮罩策略精准化 | +5-10% |
| flatten 灰128 | +5-8% |
| 旋转45° + 宽矩形裁剪(85%×55%) | +10-15% |
| normalize 均衡化 | +5-8% |
| 遮罩灰128 替代黑0 | +3-5% |
| **综合** | **从 ~65-75% → ~85-95%** |

### 10.3 备选方案：@xenova/transformers 特征向量

如果 pHash 优化后仍不够精确（< 90%），引入 AI 特征向量：

```bash
npm install @xenova/transformers
```

```typescript
import { pipeline } from '@xenova/transformers';
const extractor = await pipeline('image-feature-extraction', 'Xenova/vit-base-patch16-224');
const features = await extractor('装备图片路径');
// 输出 768 维向量 → 余弦相似度匹配
```

- 首次运行下载模型 ~350MB，之后缓存
- 预期准确率 95%+
- 可 pHash 粗筛 → 特征向量精排

---

## 11. 历史试错记录

### 试错 1：文字 OCR 识别装备名（V2.7 及更早）

**方案**：腾讯云 GeneralBasicOCR 识别截图中的文字 → EquipmentParser 解析装备名+等级+数量+品质 → enrichWithCatalog 模糊匹配参考库

**问题**：
- 游戏内装备图标主体是图像而非文字，OCR 无法识别图标内容
- 只能识别截图中的文字标签（如顶部搜索栏），无法识别装备本身
- 中文 OCR 对游戏字体识别率低

**结论**：文字 OCR 方案不适用于装备图标识别，改为图片相似度匹配（pHash）

### 试错 2：歧义差距检验（V2.7.1 ~ V2.9.6）

**方案**：best 与 second best 的汉明距离差距 < 3 时，判定为歧义匹配，丢弃结果

**问题**：
- 参考库有 2000+ 装备，同名不同品质/等级的装备 pHash 非常接近
- best 和 second best 差距几乎永远 < 3
- 导致 95%+ 的匹配被歧义丢弃，识别率极低

**结论**：V2.9.6.1 取消歧义检验，直接取 best 结果。同名装备按装备名分组，组内取最佳。

### 试错 3：固定百分比裁剪击杀详情（V2.8 ~ V2.9.8）

**方案**：对击杀详情截图按固定左右百分比（50%）裁剪左面板 → 按行列估算切出装备格子 → pHash 匹配

**问题**：
- 不同设备/分辨率的截图，击杀详情弹窗位置和比例不同
- 固定百分比经常切歪，包含大量非装备区域
- 击杀详情装备格子只有 3×4 = 最多 10 个，且有空格

**演进**：
- V2.9.9：改为百分比中心坐标定位每个格子（固定10格位置）
- 后来改为官网战报 API 匹配（不再依赖图片 pHash）

### 试错 4：OpenCV findContours 自动检测格子（V2.10.3）

**方案**：使用 opencv-wasm 的 findContours 自适应检测装备格子边框 → 提取轮廓 → 过滤正方形轮廓

**问题**：
- opencv-wasm 在 Node.js 环境下兼容性差，经常加载失败
- 装备格子边框与品质纹理背景混杂，轮廓检测噪声大
- 候选格子数量经常与预期不符（过多或过少）

**结论**：作为 fallback 保留，主力方案改为半自动定位（3框定位法 / 区域框选法 / V2.12 中心点法）

### 试错 5：自动 iconSize 估算 + gridCut（V2.7 ~ V2.9.5）

**方案**：根据截图宽度估算每格 iconSize → detectGridRegion 按行方差找装备区域 → 等间距切割

**问题**：
- iconSize 估算基于"宽度÷列数"，但不同类型截图列数不同（4~8列）
- 行方差检测容易把 UI 元素（搜索栏、按钮）误判为装备区域
- 间隙宽度不固定，等间距切割导致格子错位

**结论**：改为前端传入明确的 layout（cols×rows）和区域框选，不再自动探测

### 试错 6：统一三角遮盖（V2.9.6 ~ 当前）

**方案**：对所有图片（截图+渲染图）统一遮盖左上角+右上角+右下角

**问题**：
- 渲染图本身有左上角等级标记，遮盖后反而与截图（也有左上角标记，但被遮盖了）虽然一致，但丢失了有用的结构信息
- 三角都用纯黑(0,0,0)遮盖，在 DCT 低频中引入强亮度跳变
- 不区分两个流程（库存/补装），截图角标特征不同

**结论**：V2.13 改为按流程分流遮罩 + 灰128替代纯黑

### 试错 7：纯 pHash 直接匹配渲染图（V2.7.1 ~ 当前）

**方案**：截图切图后直接算 pHash → 与渲染图的 pHash 做汉明距离

**问题**：
- 截图有品质纹理背景，渲染图无背景 → 两端预处理不对齐
- pHash 编码了大量背景纹理信息而非装备主体
- flatten 用黑色导致渲染图的透明区域与截图背景差异更大
- 没有 normalize 导致亮度差异被编码进哈希

**结论**：不是算法不行，是预处理没对齐。V2.13 对齐两端预处理管线（灰128背景 + 旋转 + normalize）

---

## 附录：核心代码文件索引

| 文件 | 功能 |
|---|---|
| `server/src/modules/ocr/image-match.service.ts` | **核心**：pHash 计算、切图、预处理、匹配、数量提取、品质检测 |
| `server/src/modules/ocr/ocr.service.ts` | OCR 服务（创建批次、识别、确认、入库） |
| `server/src/modules/ocr/ocr.controller.ts` | OCR 接口控制器 |
| `server/src/modules/equipment-catalog/catalog.service.ts` | 参考库图片下载、hot截图上传、pHash 重算 |
| `server/src/modules/kook/kook-message.service.ts` | KOOK 消息处理（击杀详情自动识别 + OC碎文字处理） |
| `server/src/modules/resupply/resupply.service.ts` | 补装服务（预览匹配、创建记录） |
