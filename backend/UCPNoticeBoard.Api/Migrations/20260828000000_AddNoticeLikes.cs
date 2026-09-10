using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace UCPNoticeBoard.Api.Migrations
{
    public partial class AddNoticeLikes : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "LikeCount",
                table: "Notices",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "NoticeLikes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    NoticeId = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NoticeLikes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_NoticeLikes_UserId_NoticeId",
                table: "NoticeLikes",
                columns: new[] { "UserId", "NoticeId" },
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "NoticeLikes");
            migrationBuilder.DropColumn(name: "LikeCount", table: "Notices");
        }
    }
}
