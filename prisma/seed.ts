/**
 * Seed script — creates a fully populated demo workspace.
 *
 *   npm run db:seed
 *
 * The workspace is attached to the first real (Clerk-synced) user in the
 * database when one exists, so after signing in once you immediately see a
 * board with real data. If no user exists yet a placeholder owner is created.
 */
import { PrismaClient, Priority, Role, TaskStatus, ProjectStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

const DEMO_SLUG = "acme-product";

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return d;
}

async function main() {
  console.log("→ Seeding TaskForge demo data…");

  // 1. Owner — prefer a real user synced from Clerk.
  let owner = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!owner) {
    owner = await prisma.user.create({
      data: {
        clerkId: `seed_${randomUUID()}`,
        email: "demo.owner@taskforge.app",
        name: "Demo Owner",
        imageUrl: null,
      },
    });
    console.log("  · no Clerk user found — created placeholder owner");
  } else {
    console.log(`  · using existing user ${owner.email} as workspace owner`);
  }

  // 2. Teammates.
  const teammateSeeds = [
    { email: "linh.tran@taskforge.app", name: "Trần Mỹ Linh" },
    { email: "hoang.pham@taskforge.app", name: "Phạm Việt Hoàng" },
    { email: "an.nguyen@taskforge.app", name: "Nguyễn Hải An" },
    { email: "mai.le@taskforge.app", name: "Lê Thanh Mai" },
  ];
  const extra = (process.env.SEED_DEMO_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ email, name: email.split("@")[0] }));

  const teammates = [];
  for (const t of [...teammateSeeds, ...extra]) {
    teammates.push(
      await prisma.user.upsert({
        where: { email: t.email },
        update: {},
        create: { clerkId: `seed_${randomUUID()}`, email: t.email, name: t.name },
      }),
    );
  }

  // 3. Workspace (idempotent — wipe and recreate the demo one).
  await prisma.workspace.deleteMany({ where: { slug: DEMO_SLUG } });
  const workspace = await prisma.workspace.create({
    data: {
      name: "Acme Product",
      slug: DEMO_SLUG,
      description: "Không gian làm việc demo của đội sản phẩm Acme.",
      color: "#6366f1",
      ownerId: owner.id,
      members: {
        create: [
          { userId: owner.id, role: Role.OWNER },
          { userId: teammates[0].id, role: Role.ADMIN },
          { userId: teammates[1].id, role: Role.MEMBER },
          { userId: teammates[2].id, role: Role.MEMBER },
          { userId: teammates[3].id, role: Role.VIEWER },
        ],
      },
    },
  });

  // 4. Labels.
  const labelSeeds = [
    { name: "bug", color: "#ef4444" },
    { name: "feature", color: "#6366f1" },
    { name: "design", color: "#ec4899" },
    { name: "backend", color: "#14b8a6" },
    { name: "docs", color: "#f59e0b" },
    { name: "tech-debt", color: "#8b5cf6" },
  ];
  const labels = await Promise.all(
    labelSeeds.map((l) =>
      prisma.label.create({ data: { ...l, workspaceId: workspace.id } }),
    ),
  );

  // 5. Projects.
  const projectSeeds = [
    {
      name: "Web Platform",
      key: "WEB",
      icon: "Globe",
      color: "#6366f1",
      description: "Ứng dụng web chính và design system.",
      status: ProjectStatus.ACTIVE,
    },
    {
      name: "Mobile App",
      key: "MOB",
      icon: "Smartphone",
      color: "#14b8a6",
      description: "Ứng dụng iOS & Android.",
      status: ProjectStatus.ACTIVE,
    },
    {
      name: "Marketing Site",
      key: "MKT",
      icon: "Megaphone",
      color: "#f59e0b",
      description: "Landing page, blog và SEO.",
      status: ProjectStatus.PLANNING,
    },
  ];

  const columnSeeds = [
    { name: "Backlog", color: "#94a3b8", status: TaskStatus.BACKLOG, wipLimit: 0 },
    { name: "Todo", color: "#64748b", status: TaskStatus.TODO, wipLimit: 0 },
    { name: "In Progress", color: "#6366f1", status: TaskStatus.IN_PROGRESS, wipLimit: 5 },
    { name: "In Review", color: "#f59e0b", status: TaskStatus.IN_REVIEW, wipLimit: 4 },
    { name: "Done", color: "#10b981", status: TaskStatus.DONE, wipLimit: 0 },
  ];

  const members = [owner, ...teammates];
  const priorities = [Priority.URGENT, Priority.HIGH, Priority.MEDIUM, Priority.LOW, Priority.NONE];

  const taskTitlesByProject: Record<string, string[]> = {
    WEB: [
      "Thiết kế lại trang Dashboard",
      "Tối ưu thời gian tải trang board",
      "Sửa lỗi kéo thả trên Safari",
      "Thêm bộ lọc nâng cao cho danh sách task",
      "Viết tài liệu cho design system",
      "Chuẩn hoá token màu cho Dark Mode",
      "Thêm phím tắt điều hướng nhanh",
      "Refactor lớp truy cập dữ liệu Prisma",
      "Bổ sung skeleton loading cho Kanban",
      "Tích hợp báo cáo lỗi Sentry",
      "Cải thiện khả năng truy cập bàn phím",
      "Thêm chế độ xem dòng thời gian",
      "Xử lý phân trang cho hoạt động gần đây",
      "Viết e2e test cho luồng tạo task",
      "Nâng cấp Next.js lên bản mới nhất",
      "Thêm export CSV cho báo cáo",
    ],
    MOB: [
      "Dựng khung điều hướng chính",
      "Đồng bộ dữ liệu offline",
      "Thiết kế màn hình chi tiết công việc",
      "Push notification cho task được giao",
      "Sửa lỗi crash khi mở board lớn",
      "Tối ưu bundle size cho Android",
      "Thêm đăng nhập sinh trắc học",
      "Kiểm thử trên thiết bị màn hình nhỏ",
      "Bổ sung haptic feedback khi kéo thả",
      "Chuẩn bị build cho TestFlight",
    ],
    MKT: [
      "Viết nội dung trang chủ mới",
      "Thiết kế hero section",
      "Tối ưu Core Web Vitals",
      "Lên lịch bài blog quý này",
      "Cài đặt theo dõi chuyển đổi",
      "Dựng trang bảng giá",
      "Chuẩn bị bộ ảnh cho social",
      "A/B test nút kêu gọi hành động",
    ],
  };

  for (const p of projectSeeds) {
    const titles = taskTitlesByProject[p.key];
    const project = await prisma.project.create({
      data: {
        ...p,
        workspaceId: workspace.id,
        createdById: owner.id,
        startDate: daysFromNow(-30),
        dueDate: daysFromNow(45),
        members: {
          create: members.slice(0, 4).map((m, i) => ({
            userId: m.id,
            role: i === 0 ? Role.OWNER : Role.MEMBER,
          })),
        },
        columns: {
          create: columnSeeds.map((c, i) => ({ ...c, order: (i + 1) * 1000 })),
        },
      },
      include: { columns: { orderBy: { order: "asc" } } },
    });

    let number = 0;
    for (let i = 0; i < titles.length; i++) {
      // Distribute tasks across columns with a realistic funnel shape.
      const bucket = i % 5 === 0 ? 4 : i % 7 === 0 ? 3 : i % 3 === 0 ? 2 : i % 2 === 0 ? 1 : 0;
      const column = project.columns[bucket];
      const isDone = column.status === TaskStatus.DONE;
      number += 1;

      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          columnId: column.id,
          number,
          title: titles[i],
          description:
            "Mô tả chi tiết cho công việc này. Bao gồm bối cảnh, tiêu chí hoàn thành và các ràng buộc kỹ thuật cần lưu ý.",
          status: column.status,
          priority: priorities[i % priorities.length],
          order: (i + 1) * 1000,
          assigneeId: members[i % members.length].id,
          createdById: owner.id,
          startDate: daysFromNow(-14 + (i % 10)),
          dueDate: daysFromNow(-6 + (i % 24)),
          estimate: [1, 2, 3, 5, 8][i % 5],
          completedAt: isDone ? daysFromNow(-(i % 12)) : null,
          labels: {
            create: [{ labelId: labels[i % labels.length].id }],
          },
          checklistItems: {
            create: [
              { title: "Phân tích yêu cầu", done: true, order: 1000 },
              { title: "Triển khai", done: isDone, order: 2000 },
              { title: "Viết kiểm thử", done: isDone, order: 3000 },
              { title: "Review & merge", done: isDone, order: 4000 },
            ],
          },
        },
      });

      // A couple of subtasks on every third task.
      if (i % 3 === 0) {
        for (let s = 1; s <= 2; s++) {
          number += 1;
          await prisma.task.create({
            data: {
              projectId: project.id,
              columnId: column.id,
              number,
              parentId: task.id,
              title: `${titles[i]} — bước ${s}`,
              status: isDone ? TaskStatus.DONE : TaskStatus.TODO,
              priority: Priority.MEDIUM,
              order: s * 1000,
              assigneeId: members[(i + s) % members.length].id,
              createdById: owner.id,
              dueDate: daysFromNow(3 + s),
              completedAt: isDone ? daysFromNow(-2) : null,
            },
          });
        }
      }

      // Comments.
      if (i % 2 === 0) {
        await prisma.comment.createMany({
          data: [
            {
              taskId: task.id,
              authorId: members[(i + 1) % members.length].id,
              content: "Mình đã xem qua, phần này nên tách thành hai bước nhỏ để dễ review hơn.",
            },
            {
              taskId: task.id,
              authorId: members[(i + 2) % members.length].id,
              content: "Đồng ý, mình sẽ cập nhật checklist trong hôm nay.",
            },
          ],
        });
      }
    }

    await prisma.project.update({
      where: { id: project.id },
      data: { taskCounter: number },
    });

    console.log(`  · project ${project.key} — ${number} tasks`);
  }

  // 6. Notifications for the owner.
  await prisma.notification.createMany({
    data: [
      {
        userId: owner.id,
        workspaceId: workspace.id,
        actorId: teammates[0].id,
        type: "TASK_ASSIGNED",
        title: "Bạn được giao một công việc mới",
        body: "Thiết kế lại trang Dashboard",
        link: `/w/${DEMO_SLUG}/my-tasks`,
      },
      {
        userId: owner.id,
        workspaceId: workspace.id,
        actorId: teammates[1].id,
        type: "COMMENT_CREATED",
        title: "Bình luận mới trong công việc của bạn",
        body: "Mình đã xem qua, phần này nên tách thành hai bước nhỏ.",
        link: `/w/${DEMO_SLUG}/my-tasks`,
      },
      {
        userId: owner.id,
        workspaceId: workspace.id,
        type: "TASK_DUE_SOON",
        title: "Sắp đến hạn",
        body: "3 công việc sẽ đến hạn trong 48 giờ tới.",
        link: `/w/${DEMO_SLUG}/my-tasks`,
        read: true,
      },
    ],
  });

  console.log(`✔ Done. Workspace: /w/${DEMO_SLUG}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
