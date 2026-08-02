using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace UCPNoticeBoard.Api.Migrations
{
    public partial class AddCategoriesLinksAndDismissals : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Categories_Name",
                table: "Categories",
                column: "Name",
                unique: true);

            migrationBuilder.AddColumn<string>(
                name: "LinkUrl",
                table: "Notices",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CategoryId",
                table: "Notices",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Notices_CategoryId",
                table: "Notices",
                column: "CategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_Notices_Categories_CategoryId",
                table: "Notices",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.CreateTable(
                name: "NoticeDismissals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    NoticeId = table.Column<int>(type: "integer", nullable: false),
                    DismissedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NoticeDismissals", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_NoticeDismissals_UserId_NoticeId",
                table: "NoticeDismissals",
                columns: new[] { "UserId", "NoticeId" },
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "NoticeDismissals");
            migrationBuilder.DropForeignKey(name: "FK_Notices_Categories_CategoryId", table: "Notices");
            migrationBuilder.DropIndex(name: "IX_Notices_CategoryId", table: "Notices");
            migrationBuilder.DropColumn(name: "CategoryId", table: "Notices");
            migrationBuilder.DropColumn(name: "LinkUrl", table: "Notices");
            migrationBuilder.DropTable(name: "Categories");
        }
    }
}
