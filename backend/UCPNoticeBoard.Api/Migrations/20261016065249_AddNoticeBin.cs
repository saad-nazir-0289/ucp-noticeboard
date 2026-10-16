using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace UCPNoticeBoard.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNoticeBin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Notices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DeletedByUserId",
                table: "Notices",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Notices_DeletedAt",
                table: "Notices",
                column: "DeletedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Notices_DeletedAt",
                table: "Notices");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Notices");

            migrationBuilder.DropColumn(
                name: "DeletedByUserId",
                table: "Notices");
        }
    }
}
